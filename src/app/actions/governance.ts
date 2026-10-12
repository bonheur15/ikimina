"use server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { accountTokens, auditLog, settings, users } from "@/db/schema";
import { assertSuperadmin, getViewer } from "@/lib/auth/viewer";
import { loanPolicySchema } from "@/lib/loan-policy";
import { encryptPushKey, notificationPolicySchema } from "@/lib/notification-settings";
import { runLoanReminders } from "@/lib/loan-notifications";
import { flushPushNotifications } from "@/lib/onesignal";
import type { FinanceTx } from "@/lib/finance-lock";

async function perform<T>(work: () => Promise<T>) {
  try {
    const value = await work();
    revalidatePath("/admin", "layout");
    revalidatePath("/member", "layout");
    return { ok: true as const, value };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Check the form.")
          : error instanceof Error
            ? error.message
            : "Could not complete this operation.",
    };
  }
}
async function invite(tx: FinanceTx, userId: string, actorId: string) {
  await tx
    .update(accountTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(accountTokens.userId, userId), isNull(accountTokens.usedAt)));
  const token = randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 7 * 86400000);
  await tx
    .insert(accountTokens)
    .values({ userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt, createdBy: actorId });
  await tx.insert(auditLog).values({ actorId, action: "staff.invitation", entity: "user", entityId: userId });
  return { token, expiresAt: expiresAt.toISOString() };
}
async function urlFor(token: string) {
  const h = await headers();
  const origin =
    process.env.AUTH_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return `${origin}/set-password?token=${token}`;
}
export async function createStaffAccount(input: {
  name: string;
  email: string;
  role: "superadmin" | "secretary" | "manager";
}) {
  return perform(async () => {
    const actor = await getViewer();
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.email().toLowerCase().max(200),
        role: z.enum(["superadmin", "secretary", "manager"]),
      })
      .parse(input);
    const link = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(724502)`);
      const count = await tx.$count(users, eq(users.role, "superadmin"));
      if (
        !actor ||
        (actor.role !== "superadmin" && !(actor.role === "secretary" && count === 0 && data.role === "superadmin"))
      )
        throw new Error(
          "Only superadmin can create staff accounts; the secretary can create the first superadmin during setup.",
        );
      if (await tx.$count(users, eq(users.email, data.email)))
        throw new Error("That email already has an account. Use its role control instead.");
      const [user] = await tx
        .insert(users)
        .values({ ...data })
        .returning();
      await tx.insert(auditLog).values({
        actorId: actor.id,
        action: "staff.create",
        entity: "user",
        entityId: user.id,
        details: { role: data.role, email: data.email },
      });
      return invite(tx, user.id, actor.id);
    });
    return { url: await urlFor(link.token), expiresAt: link.expiresAt };
  });
}
export async function staffSignInLink(id: string) {
  return perform(async () => {
    const actor = await getViewer();
    z.uuid().parse(id);
    const link = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(724502)`);
      const [target] = await tx.select().from(users).where(eq(users.id, id));
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "superadmin"), isNull(users.disabledAt), sql`${users.passwordHash} is not null`));
      if (
        !target ||
        !actor ||
        (actor.role !== "superadmin" &&
          !(
            actor.role === "secretary" &&
            target.role === "superadmin" &&
            !target.passwordHash &&
            !target.disabledAt &&
            active.count === 0
          ))
      )
        throw new Error("Only superadmin can reset staff accounts.");
      return invite(tx, id, actor.id);
    });
    return { url: await urlFor(link.token), expiresAt: link.expiresAt };
  });
}
export async function updateStaffAccess(input: {
  id: string;
  role: "superadmin" | "secretary" | "manager" | "member";
  disabled: boolean;
}) {
  return perform(async () => {
    const actor = await assertSuperadmin();
    const data = z
      .object({ id: z.uuid(), role: z.enum(["superadmin", "secretary", "manager", "member"]), disabled: z.boolean() })
      .parse(input);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(724502)`);
      const [target] = await tx.select().from(users).where(eq(users.id, data.id)).for("update");
      if (!target) throw new Error("Account not found.");
      if (data.id === actor.id && (data.disabled || data.role !== "superadmin"))
        throw new Error("You cannot disable or demote your own superadmin account.");
      if (target.role === "superadmin" && (data.disabled || data.role !== "superadmin")) {
        const [others] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(
            and(
              eq(users.role, "superadmin"),
              isNull(users.disabledAt),
              sql`${users.passwordHash} is not null and ${users.id} <> ${data.id}`,
            ),
          );
        if (!others.count) throw new Error("Keep at least one active superadmin account.");
      }
      await tx
        .update(users)
        .set({ role: data.role, disabledAt: data.disabled ? new Date() : null })
        .where(eq(users.id, data.id));
      await tx
        .insert(auditLog)
        .values({ actorId: actor.id, action: "staff.access_update", entity: "user", entityId: data.id, details: data });
    });
  });
}
export async function saveLoanPolicy(input: unknown) {
  return perform(async () => {
    const actor = await assertSuperadmin();
    const value = loanPolicySchema.parse({ ...(input as object), version: randomUUID() });
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({ key: "loanPolicy", value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
      await tx.insert(auditLog).values({
        actorId: actor.id,
        action: "loan.policy_update",
        entity: "settings",
        entityId: "loanPolicy",
        details: value,
      });
    });
  });
}
export async function saveNotificationSettings(input: unknown) {
  return perform(async () => {
    const actor = await assertSuperadmin();
    const data = z
      .object({
        policy: notificationPolicySchema,
        appId: z
          .string()
          .trim()
          .refine((v) => !v || z.uuid().safeParse(v).success, "Use the OneSignal App ID UUID."),
        apiKey: z.string().trim().max(1000),
        siteUrl: z
          .string()
          .trim()
          .refine((v) => {
            try {
              const url = new URL(v);
              return (
                url.protocol === "https:" ||
                (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
              );
            } catch {
              return false;
            }
          }, "Use the public HTTPS address of this app."),
        clearKey: z.boolean(),
      })
      .parse(input);
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(settings).where(eq(settings.key, "oneSignal"));
      const previous = old?.value as { encryptedKey?: string } | undefined;
      const value = {
        appId: data.appId,
        siteUrl: data.siteUrl,
        encryptedKey: data.clearKey
          ? null
          : data.apiKey
            ? encryptPushKey(data.apiKey)
            : (previous?.encryptedKey ?? null),
        disabled: data.clearKey,
      };
      for (const [key, setting] of [
        ["oneSignal", value],
        ["notificationPolicy", data.policy],
      ] as const)
        await tx
          .insert(settings)
          .values({ key, value: setting })
          .onConflictDoUpdate({ target: settings.key, set: { value: setting, updatedAt: new Date() } });
      await tx.insert(auditLog).values({
        actorId: actor.id,
        action: "notification.settings_update",
        entity: "settings",
        details: {
          policy: data.policy,
          appId: data.appId,
          siteUrl: data.siteUrl,
          keyUpdated: !!data.apiKey,
          keyCleared: data.clearKey,
        },
      });
    });
  });
}
export async function triggerNotifications() {
  return perform(async () => {
    const actor = await assertSuperadmin();
    const loans = await runLoanReminders();
    const push = await flushPushNotifications(true);
    await db.insert(auditLog).values({
      actorId: actor.id,
      action: "notification.manual_trigger",
      entity: "notifications",
      details: { loans, push },
    });
    return { loans, push };
  });
}
