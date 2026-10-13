"use server";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, members, pushNotifications, shareChangeRequests, users } from "@/db/schema";
import { assertAdmin, getViewer } from "@/lib/auth/viewer";
import { lockFinance } from "@/lib/finance-lock";
import { canReadGroup } from "@/lib/permissions";
import { notifyMember } from "@/lib/penalty-automation";
import { savingsContributionPeriod } from "@/lib/penalty-policy";
import { kigaliToday } from "@/lib/portal-data";
import { loadSharePlan, MAX_SHARES, savingsAllowance, scheduleShares, ShareError, sharesFor } from "@/lib/share-plans";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a savings month.");

async function run<T>(work: () => Promise<T>) {
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
          : error instanceof ShareError
            ? error.message
            : "Could not complete this request. Refresh and try again.",
    };
  }
}
async function ownMember() {
  const viewer = await getViewer();
  if (!viewer?.member) throw new ShareError("Your account isn’t linked to a member profile.");
  return { viewer, member: viewer.member };
}
/** Share changes start from the current savings window or a later one, never rewriting past months. */
function checkStart(period: string) {
  const first = savingsContributionPeriod(kigaliToday());
  if (period < first) throw new ShareError("Choose the current savings month or a later one.");
  const [y, m] = first.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + 24, 1)).toISOString().slice(0, 7);
  if (period > last) throw new ShareError("Choose a month within the next two years.");
}

/** Target, paid, pending and remaining savings for one of the member's own months. */
export async function getSavingsAllowance(period: string) {
  return run(async () => {
    const { member } = await ownMember();
    return savingsAllowance(db, member.id, month.parse(period));
  });
}

export async function getOwnSharePlan() {
  return run(async () => loadSharePlan((await ownMember()).member.id));
}

export async function requestShareChange(input: { shares: number; reason: string }) {
  return run(async () => {
    const { viewer, member } = await ownMember();
    const data = z
      .object({
        shares: z.number().int("Use a whole number of shares.").min(1, "Request at least 1 share.").max(MAX_SHARES),
        reason: z.string().trim().min(5, "Tell the secretary why you want this change.").max(500),
      })
      .parse(input);
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(members).where(eq(members.id, member.id)).for("update");
      if (!row || row.status !== "active") throw new ShareError("Only active members can request share changes.");
      const current = (await sharesFor(tx, member.id, savingsContributionPeriod(kigaliToday()))) ?? 0;
      if (current === data.shares) throw new ShareError("That is already your monthly share count.");
      const [request] = await tx
        .insert(shareChangeRequests)
        .values({ memberId: member.id, currentShares: current, requestedShares: data.shares, reason: data.reason })
        .onConflictDoNothing()
        .returning();
      if (!request) throw new ShareError("You already have a share request waiting for the secretary.");
      await tx.insert(auditLog).values({
        actorId: viewer.id,
        action: "shares.request",
        entity: "share_change_request",
        entityId: request.id,
        details: { member: member.code, from: current, to: data.shares },
      });
      const staff = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.role, ["secretary", "superadmin"]), isNull(users.disabledAt)));
      for (const s of staff)
        await tx
          .insert(pushNotifications)
          .values({
            userId: s.id,
            eventKey: `share-request:${request.id}:${s.id}`,
            title: "Share change request",
            body: `${member.code} asked to change their monthly savings to ${data.shares} share(s).`,
            path: "/admin/members",
          })
          .onConflictDoNothing();
    });
  });
}

export async function cancelShareRequest(id: string) {
  return run(async () => {
    const { viewer, member } = await ownMember();
    z.uuid().parse(id);
    const [cancelled] = await db
      .update(shareChangeRequests)
      .set({ status: "cancelled", reviewedAt: new Date() })
      .where(
        and(
          eq(shareChangeRequests.id, id),
          eq(shareChangeRequests.memberId, member.id),
          eq(shareChangeRequests.status, "pending"),
        ),
      )
      .returning({ id: shareChangeRequests.id });
    if (!cancelled) throw new ShareError("This request has already been reviewed.");
    await db
      .insert(auditLog)
      .values({ actorId: viewer.id, action: "shares.request_cancel", entity: "share_change_request", entityId: id });
  });
}

async function secretary() {
  return assertAdmin().catch(() => {
    throw new ShareError("Only the secretary can change member shares.");
  });
}
async function memberByCode(code: string) {
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.code, z.string().min(1).parse(code)));
  if (!member) throw new ShareError("Member not found.");
  return member;
}

/** Staff view of one member's shares; managers may read it too. */
export async function getMemberSharePlan(code: string) {
  return run(async () => {
    const viewer = await getViewer();
    if (!canReadGroup(viewer?.role)) throw new ShareError("You can’t view member shares.");
    return loadSharePlan((await memberByCode(code)).id);
  });
}

/** Pending share requests across the group, newest first, for the secretary's members page. */
export async function listShareRequests() {
  return run(async () => {
    const viewer = await getViewer();
    if (!canReadGroup(viewer?.role)) throw new ShareError("You can’t view share requests.");
    return db
      .select({
        id: shareChangeRequests.id,
        code: members.code,
        surname: members.surname,
        firstName: members.firstName,
        currentShares: shareChangeRequests.currentShares,
        requestedShares: shareChangeRequests.requestedShares,
        reason: shareChangeRequests.reason,
        createdAt: shareChangeRequests.createdAt,
      })
      .from(shareChangeRequests)
      .innerJoin(members, eq(members.id, shareChangeRequests.memberId))
      .where(eq(shareChangeRequests.status, "pending"))
      .orderBy(desc(shareChangeRequests.createdAt))
      .limit(100);
  });
}

export async function setMemberShares(input: { code: string; shares: number; effectivePeriod: string }) {
  return run(async () => {
    const admin = await secretary();
    const data = z
      .object({
        code: z.string().min(1),
        shares: z.number().int("Use a whole number of shares.").min(0).max(MAX_SHARES),
        effectivePeriod: month,
      })
      .parse(input);
    checkStart(data.effectivePeriod);
    const member = await memberByCode(data.code);
    await db.transaction(async (tx) => {
      await lockFinance(tx);
      await scheduleShares(tx, { memberId: member.id, ...data, actorId: admin.id });
      await tx.insert(auditLog).values({
        actorId: admin.id,
        action: "shares.set",
        entity: "member",
        entityId: member.code,
        details: { shares: data.shares, effectivePeriod: data.effectivePeriod },
      });
      await notifyMember(
        tx,
        member.id,
        `shares-set:${member.id}:${data.effectivePeriod}:${data.shares}:${Date.now()}`,
        "Monthly shares updated",
        `Your monthly savings are ${data.shares} share(s) from ${data.effectivePeriod}. Open Elayo Family for details.`,
      );
    });
  });
}

export async function reviewShareRequest(input: {
  id: string;
  approved: boolean;
  effectivePeriod: string;
  note: string;
}) {
  return run(async () => {
    const admin = await secretary();
    const data = z
      .object({
        id: z.uuid(),
        approved: z.boolean(),
        effectivePeriod: z.string(),
        note: z.string().trim().max(300),
      })
      .parse(input);
    if (data.approved) checkStart(month.parse(data.effectivePeriod));
    else if (data.note.length < 3) throw new ShareError("Add a short note explaining the decision.");
    await db.transaction(async (tx) => {
      await lockFinance(tx);
      const [request] = await tx
        .select()
        .from(shareChangeRequests)
        .where(eq(shareChangeRequests.id, data.id))
        .for("update");
      if (!request) throw new ShareError("Request not found.");
      if (request.status !== "pending") throw new ShareError("This request has already been reviewed.");
      await tx
        .update(shareChangeRequests)
        .set({
          status: data.approved ? "approved" : "rejected",
          effectivePeriod: data.approved ? data.effectivePeriod : null,
          reviewNote: data.note || null,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
        })
        .where(eq(shareChangeRequests.id, request.id));
      if (data.approved)
        await scheduleShares(tx, {
          memberId: request.memberId,
          shares: request.requestedShares,
          effectivePeriod: data.effectivePeriod,
          actorId: admin.id,
          requestId: request.id,
        });
      await tx.insert(auditLog).values({
        actorId: admin.id,
        action: data.approved ? "shares.request_approve" : "shares.request_reject",
        entity: "share_change_request",
        entityId: request.id,
        details: { shares: request.requestedShares, effectivePeriod: data.approved ? data.effectivePeriod : null },
      });
      await notifyMember(
        tx,
        request.memberId,
        `share-reviewed:${request.id}`,
        data.approved ? "Share change approved" : "Share change declined",
        data.approved
          ? `Your monthly savings will be ${request.requestedShares} share(s) from ${data.effectivePeriod}.`
          : "Your share change request was declined. Open Elayo Family to read the secretary’s note.",
      );
    });
  });
}
