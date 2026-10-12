"use server";

import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, members, penaltyAssessments } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/viewer";
import { kigaliToday } from "@/lib/portal-data";

const assessment = z.object({
  memberCode: z.string().min(1, "Select a member."),
  amount: z.number().finite().positive().max(100_000_000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Use no more than two decimal places."),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the contribution month."),
  assessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const d = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && value <= kigaliToday();
  }, "Choose a valid issue date that is not in the future."),
  reason: z.string().trim().min(3, "Enter the penalty reason.").max(200),
});

export async function addPenaltyAssessment(input: z.input<typeof assessment>) {
  const admin = await assertAdmin();
  const parsed = assessment.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const { memberCode, ...data } = parsed.data;
  const member = await db.query.members.findFirst({ where: eq(members.code, memberCode) });
  if (!member) return { ok: false as const, error: "That member no longer exists." };
  const reference = `FINE-${data.assessedOn.replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
  await db.transaction(async tx => {
    const [row] = await tx.insert(penaltyAssessments).values({ ...data, reference, memberId: member.id, recordedBy: admin.id }).returning();
    await tx.insert(auditLog).values({ actorId: admin.id, action: "penalty.assess", entity: "penalty_assessment", entityId: row.id,
      details: { reference, memberCode, ...data } });
  });
  return { ok: true as const, reference };
}

export async function cancelPenaltyAssessment(id: string, reason: string) {
  const admin = await assertAdmin();
  const parsed = z.object({ id: z.uuid(), reason: z.string().trim().min(3, "Explain why this penalty is being cancelled.").max(300) }).safeParse({ id, reason });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return db.transaction(async tx => {
    const [penalty] = await tx.select().from(penaltyAssessments).where(eq(penaltyAssessments.id, parsed.data.id)).for("update");
    if (!penalty || penalty.voidedAt) return { ok: false as const, error: "This penalty is no longer available." };
    const [payments] = await tx.execute(sql`select count(*)::int as count from ledger_entries where
      penalty_assessment_id = ${penalty.id} and voided_at is null`) as unknown as { count: number }[];
    if (payments.count) return { ok: false as const, error: "Remove its payment records before cancelling this penalty." };
    await tx.update(penaltyAssessments).set({ voidedAt: new Date(), voidedBy: admin.id, voidReason: parsed.data.reason }).where(eq(penaltyAssessments.id, penalty.id));
    await tx.insert(auditLog).values({ actorId: admin.id, action: "penalty.cancel", entity: "penalty_assessment", entityId: penalty.id,
      details: { reference: penalty.reference, reason: parsed.data.reason } });
    return { ok: true as const };
  });
}
