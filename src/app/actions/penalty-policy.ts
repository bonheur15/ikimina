"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, members, penaltyDelayRequests, pushNotifications, settings, users } from "@/db/schema";
import { assertAdmin, assertSuperadmin, requireViewer } from "@/lib/auth/viewer";
import { currentPeriod, kigaliToday } from "@/lib/portal-data";
import { getPenaltyPolicy, notifyMember, runPenaltyAutomation } from "@/lib/penalty-automation";
import { savingsWindow } from "@/lib/penalty-policy";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Choose a valid date.");
const policyInput = z.object({ enabled: z.boolean(), effectivePeriod: month, basis: z.enum(["unpaid", "committed"]), pausePending: z.boolean() });
export async function savePenaltyPolicy(input: z.input<typeof policyInput>) {
  const admin = await assertSuperadmin();
  const parsed = policyInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the penalty settings." };
  const old = await getPenaltyPolicy();
  if (parsed.data.effectivePeriod < currentPeriod() && parsed.data.effectivePeriod !== old.effectivePeriod)
    return { ok: false as const, error: "Choose this month or a future month. Historical penalties are not backfilled." };
  if (old.enabled && old.effectivePeriod !== parsed.data.effectivePeriod)
    return { ok: false as const, error: "Pause automation before changing its start month." };
  await db.transaction(async tx => {
    await tx.insert(settings).values({ key: "penaltyPolicy", value: parsed.data }).onConflictDoUpdate({ target: settings.key, set: { value: parsed.data, updatedAt: new Date() } });
    await tx.insert(auditLog).values({ actorId: admin.id, action: "penalty.policy_update", entity: "settings", entityId: "penaltyPolicy", details: parsed.data });
  });
  return { ok: true as const };
}
export async function requestPenaltyDelay(input: { period: string; reason: string; requestedUntil: string }) {
  const viewer = await requireViewer();
  if (!viewer.member) return { ok: false as const, error: "Your account has no linked member profile." };
  const parsed = z.object({ period: month, reason: z.string().trim().min(10, "Please explain why you need more time.").max(500), requestedUntil: date }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const policy = await getPenaltyPolicy();
  if (parsed.data.period < policy.effectivePeriod || parsed.data.period > currentPeriod()) return { ok: false as const, error: "Choose a savings month covered by this rule." };
  if (parsed.data.requestedUntil < kigaliToday() || parsed.data.requestedUntil <= savingsWindow(parsed.data.period).dueOn)
    return { ok: false as const, error: "Choose a date after the savings deadline and not in the past." };
  return db.transaction(async tx => {
    const [member] = await tx.select().from(members).where(eq(members.id, viewer.member!.id)).for("update");
    if (!member || member.status !== "active") return { ok: false as const, error: "Only active members can request more time." };
    const [request] = await tx.insert(penaltyDelayRequests).values({ ...parsed.data, memberId: member.id }).onConflictDoNothing().returning();
    if (!request) return { ok: false as const, error: "You already submitted a reason for this savings month." };
    await tx.insert(auditLog).values({ actorId: viewer.id, action: "penalty.delay_request", entity: "penalty_delay_request", entityId: request.id, details: parsed.data });
    const admins = await tx.select({ id: users.id }).from(users).where(and(inArray(users.role, ["secretary", "superadmin"]), isNull(users.disabledAt)));
    for (const admin of admins) await tx.insert(pushNotifications).values({ userId: admin.id, eventKey: `delay-request:${request.id}:${admin.id}`,
      title: "Savings delay request", body: "A member has submitted a reason for a delayed contribution. Open Elayo Family to review it.", path: "/admin/penalties" }).onConflictDoNothing();
    return { ok: true as const };
  });
}
export async function reviewPenaltyDelay(input: { id: string; approved: boolean; deferredUntil: string; note: string }) {
  const admin = await assertAdmin();
  const parsed = z.object({ id: z.uuid(), approved: z.boolean(), deferredUntil: z.string(), note: z.string().trim().min(3, "Add a short review note.").max(300) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  if (parsed.data.approved && (!date.safeParse(parsed.data.deferredUntil).success || parsed.data.deferredUntil < kigaliToday()))
    return { ok: false as const, error: "Choose a valid new deadline that is not in the past." };
  const existing = await db.query.penaltyDelayRequests.findFirst({ where: eq(penaltyDelayRequests.id, parsed.data.id) });
  if (!existing) return { ok: false as const, error: "Request not found." };
  if (parsed.data.approved && parsed.data.deferredUntil <= savingsWindow(existing.period).dueOn)
    return { ok: false as const, error: "The new deadline must be after the original savings deadline." };
  return db.transaction(async tx => {
    await tx.select({ id: members.id }).from(members).where(eq(members.id, existing.memberId)).for("update");
    const [request] = await tx.select().from(penaltyDelayRequests).where(eq(penaltyDelayRequests.id, existing.id)).for("update");
    if (request.status !== "pending") return { ok: false as const, error: "This request has already been reviewed." };
    await tx.update(penaltyDelayRequests).set({ status: parsed.data.approved ? "approved" : "rejected", deferredUntil: parsed.data.approved ? parsed.data.deferredUntil : null,
      reviewNote: parsed.data.note, reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(penaltyDelayRequests.id, request.id));
    await tx.insert(auditLog).values({ actorId: admin.id, action: "penalty.delay_review", entity: "penalty_delay_request", entityId: request.id, details: parsed.data });
    await notifyMember(tx, request.memberId, `delay-reviewed:${request.id}`, parsed.data.approved ? "Savings delay approved" : "Savings delay reviewed",
      parsed.data.approved ? `Your savings deadline has been extended to ${parsed.data.deferredUntil}. Open Elayo Family for details.` : "Your delay request was declined. Open Elayo Family to read the administrator’s review.");
    return { ok: true as const };
  });
}
export async function checkPenaltiesNow() {
  await assertSuperadmin();
  return runPenaltyAutomation();
}
