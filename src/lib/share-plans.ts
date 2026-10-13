import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contributionProofs,
  ledgerEntries,
  memberSharePlans,
  members,
  mobilePayments,
  shareChangeRequests,
} from "@/db/schema";
import type { FinanceTx } from "./finance-lock";
import { kigaliToday, SHARE_VALUE } from "./portal-data";
import { savingsContributionPeriod } from "./penalty-policy";

export const MAX_SHARES = 1000;
export class ShareError extends Error {}
/** Plans before the first schedule row keep the commitment the member already had. */
const BASELINE_PERIOD = "2000-01";
type Reader = Pick<FinanceTx, "select">;

/** Shares a member owes for a savings month, or null when the secretary has not set any. */
export async function sharesFor(tx: Reader, memberId: string, period: string) {
  const [plan] = await tx
    .select({ shares: memberSharePlans.shares })
    .from(memberSharePlans)
    .where(and(eq(memberSharePlans.memberId, memberId), lte(memberSharePlans.effectivePeriod, period)))
    .orderBy(desc(memberSharePlans.effectivePeriod))
    .limit(1);
  if (plan) return plan.shares || null;
  const [scheduled] = await tx
    .select({ id: memberSharePlans.id })
    .from(memberSharePlans)
    .where(eq(memberSharePlans.memberId, memberId))
    .limit(1);
  // Months before a member's first scheduled shares have no target.
  if (scheduled) return null;
  const [member] = await tx
    .select({ commitment: members.monthlyCommitment })
    .from(members)
    .where(eq(members.id, memberId));
  const commitment = member?.commitment ?? 0;
  return commitment > 0 ? Math.floor(commitment / SHARE_VALUE) || null : null;
}

/**
 * What a member may still pay toward a month's savings. Mobile money awaiting confirmation and
 * receipts awaiting review are reserved so concurrent payments cannot exceed the target.
 */
export async function savingsAllowance(tx: Reader, memberId: string, period: string) {
  const shares = await sharesFor(tx, memberId, period);
  const [[paid], [inFlight], [proofs]] = await Promise.all([
    tx
      .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)`.mapWith(Number) })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.memberId, memberId),
          eq(ledgerEntries.kind, "savings"),
          eq(ledgerEntries.period, period),
          isNull(ledgerEntries.voidedAt),
        ),
      ),
    tx
      .select({
        total:
          sql<number>`coalesce(sum(coalesce(${mobilePayments.accountAmount}, ${mobilePayments.amount})), 0)`.mapWith(
            Number,
          ),
      })
      .from(mobilePayments)
      .where(
        and(
          eq(mobilePayments.memberId, memberId),
          eq(mobilePayments.purpose, "savings"),
          eq(mobilePayments.period, period),
          eq(mobilePayments.mode, "live"),
          inArray(mobilePayments.status, ["created", "pending"]),
        ),
      ),
    tx
      .select({ total: sql<number>`coalesce(sum(${contributionProofs.amount}), 0)`.mapWith(Number) })
      .from(contributionProofs)
      .where(
        and(
          eq(contributionProofs.memberId, memberId),
          eq(contributionProofs.kind, "savings"),
          eq(contributionProofs.period, period),
          eq(contributionProofs.status, "pending"),
        ),
      ),
  ]);
  const target = (shares ?? 0) * SHARE_VALUE;
  const pending = inFlight.total + proofs.total;
  return {
    period,
    shares,
    target,
    paid: paid.total,
    pending,
    remaining: Math.max(0, Math.floor(target - paid.total - pending)),
  };
}
export type SavingsAllowance = Awaited<ReturnType<typeof savingsAllowance>>;

/** Throws a readable error unless `amount` fits within the month's remaining savings. */
export async function assertSavingsAllowed(tx: Reader, memberId: string, period: string, amount: number) {
  const allowance = await savingsAllowance(tx, memberId, period);
  if (!allowance.shares)
    throw new ShareError("Your monthly shares have not been set yet. Request your shares from your account page.");
  if (allowance.remaining <= 0)
    throw new ShareError(
      allowance.pending
        ? "This month's savings are fully paid or awaiting confirmation. Check your payment activity."
        : "This month's savings are already complete.",
    );
  if (amount > allowance.remaining)
    throw new ShareError(
      `Only ${allowance.remaining.toLocaleString("en-US")} RWF remains for this month's savings. Request more shares to save more each month.`,
    );
  // Payments start at 100 RWF, so never leave a balance smaller than that to finish later.
  const left = allowance.remaining - amount;
  if (amount < 100 || (left > 0 && left < 100))
    throw new ShareError(
      `Pay at least 100 RWF and leave either nothing or at least 100 RWF for later (up to ${(allowance.remaining - 100).toLocaleString("en-US")} RWF, or exactly ${allowance.remaining.toLocaleString("en-US")} RWF).`,
    );
  return allowance;
}

/** Records shares from a savings month onward and refreshes the member's current commitment. */
export async function scheduleShares(
  tx: FinanceTx,
  input: { memberId: string; shares: number; effectivePeriod: string; actorId: string; requestId?: string },
) {
  const [member] = await tx.select().from(members).where(eq(members.id, input.memberId)).for("update");
  if (!member) throw new ShareError("Member not found.");
  const [existing] = await tx
    .select({ id: memberSharePlans.id })
    .from(memberSharePlans)
    .where(eq(memberSharePlans.memberId, member.id))
    .limit(1);
  // Keep earlier months on the commitment they were saved under.
  if (!existing && (member.monthlyCommitment ?? 0) > 0 && input.effectivePeriod > BASELINE_PERIOD)
    await tx.insert(memberSharePlans).values({
      memberId: member.id,
      effectivePeriod: BASELINE_PERIOD,
      shares: Math.floor(member.monthlyCommitment! / SHARE_VALUE),
    });
  await tx
    .insert(memberSharePlans)
    .values({
      memberId: member.id,
      effectivePeriod: input.effectivePeriod,
      shares: input.shares,
      requestId: input.requestId ?? null,
      createdBy: input.actorId,
    })
    .onConflictDoUpdate({
      target: [memberSharePlans.memberId, memberSharePlans.effectivePeriod],
      set: {
        shares: input.shares,
        requestId: input.requestId ?? null,
        createdBy: input.actorId,
        createdAt: new Date(),
      },
    });
  await refreshCommitments(tx, member.id);
}

/**
 * `members.monthly_commitment` mirrors the shares of the current savings window so existing
 * screens and reports keep reading one number. Runs after every change and daily.
 */
export async function refreshCommitments(
  tx: Pick<FinanceTx, "execute"> = db,
  memberId?: string,
  today = kigaliToday(),
) {
  const period = savingsContributionPeriod(today);
  await tx.execute(sql`
    update members m set monthly_commitment = p.shares * ${SHARE_VALUE}, updated_at = now()
    from (
      select distinct on (member_id) member_id, shares from member_share_plans
      where effective_period <= ${period} ${memberId ? sql`and member_id = ${memberId}` : sql``}
      order by member_id, effective_period desc
    ) p
    where m.id = p.member_id and m.monthly_commitment is distinct from p.shares * ${SHARE_VALUE}`);
}

/** A member's shares now, scheduled changes and requests, for the member and the secretary. */
export async function loadSharePlan(memberId: string, today = kigaliToday()) {
  const period = savingsContributionPeriod(today);
  const [current, upcoming, requests] = await Promise.all([
    sharesFor(db, memberId, period),
    db
      .select({ effectivePeriod: memberSharePlans.effectivePeriod, shares: memberSharePlans.shares })
      .from(memberSharePlans)
      .where(and(eq(memberSharePlans.memberId, memberId), gt(memberSharePlans.effectivePeriod, period)))
      .orderBy(asc(memberSharePlans.effectivePeriod)),
    db
      .select()
      .from(shareChangeRequests)
      .where(eq(shareChangeRequests.memberId, memberId))
      .orderBy(desc(shareChangeRequests.createdAt))
      .limit(5),
  ]);
  return {
    period,
    shares: current,
    upcoming,
    requests: requests.map((r) => ({
      id: r.id,
      currentShares: r.currentShares,
      requestedShares: r.requestedShares,
      reason: r.reason,
      status: r.status,
      effectivePeriod: r.effectivePeriod,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  };
}
export type SharePlan = Awaited<ReturnType<typeof loadSharePlan>>;
