import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  members,
  penaltyAssessments,
  penaltyDelayRequests,
  pushNotifications,
  savingsPenaltyCycles,
  settings,
  users,
  ledgerEntries,
} from "@/db/schema";
import { SHARE_VALUE, currentPeriod, kigaliToday } from "./portal-data";
import { addDays, dailyPenalty, pausedOn, savingsWindow, type PenaltyPolicy } from "./penalty-policy";
import { flushPushNotifications, pushConfigured } from "./onesignal";
import { refreshCommitments } from "./share-plans";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function getPenaltyPolicy(): Promise<PenaltyPolicy> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "penaltyPolicy"));
  const p = row?.value as Partial<PenaltyPolicy> | undefined;
  return {
    enabled: p?.enabled === true,
    effectivePeriod: /^\d{4}-(0[1-9]|1[0-2])$/.test(p?.effectivePeriod || "") ? p!.effectivePeriod! : currentPeriod(),
    basis: p?.basis === "committed" ? "committed" : "unpaid",
    pausePending: p?.pausePending !== false,
  };
}
export async function notifyMember(tx: Tx, memberId: string, eventKey: string, title: string, body: string) {
  const recipients = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.memberId, memberId), isNull(users.disabledAt)));
  for (const u of recipients)
    await tx
      .insert(pushNotifications)
      .values({ userId: u.id, eventKey: `${eventKey}:${u.id}`, title, body, path: "/member" })
      .onConflictDoNothing();
}

/** Snapshot only prospective windows and members who were already present when that window opened. */
async function createCycles(policy: PenaltyPolicy, today: string) {
  const [year, month] = policy.effectivePeriod.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.toISOString().slice(0, 7) <= today.slice(0, 7)) {
    const period = cursor.toISOString().slice(0, 7),
      window = savingsWindow(period);
    if (window.startsOn <= today) {
      // Shares come from the member's schedule for that month; members never scheduled keep their commitment.
      await db.execute(sql`insert into savings_penalty_cycles (member_id, period, expected_shares, basis)
        select id, ${period}, shares, ${policy.basis} from (
          select m.id, m.created_at, case
            when exists (select 1 from member_share_plans s where s.member_id = m.id) then (
              select s.shares from member_share_plans s
              where s.member_id = m.id and s.effective_period <= ${period}
              order by s.effective_period desc limit 1)
            when m.monthly_commitment % ${SHARE_VALUE} = 0 then m.monthly_commitment / ${SHARE_VALUE}
          end as shares
          from members m where m.status = 'active'
        ) planned
        where shares > 0 and created_at < ${addDays(window.startsOn, 1) + "T00:00:00+02:00"}::timestamptz
        on conflict (member_id, period) do nothing`);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}

export async function runPenaltyAutomation(today = kigaliToday()) {
  await refreshCommitments(db, undefined, today);
  const policy = await getPenaltyPolicy();
  let created = 0;
  if (policy.enabled) {
    await createCycles(policy, today);
    const cycles = await db.select().from(savingsPenaltyCycles);
    for (const original of cycles) {
      if (original.period < policy.effectivePeriod || original.processedThrough === today) continue;
      created += await db.transaction(async (tx) => {
        const [liveRule] = await tx.select().from(settings).where(eq(settings.key, "penaltyPolicy")).for("share");
        const activePolicy = liveRule?.value as PenaltyPolicy | undefined;
        if (!activePolicy?.enabled || original.period < activePolicy.effectivePeriod) return 0;
        const [member] = await tx.select().from(members).where(eq(members.id, original.memberId)).for("update");
        if (!member) return 0;
        const [cycle] = await tx
          .select()
          .from(savingsPenaltyCycles)
          .where(eq(savingsPenaltyCycles.id, original.id))
          .for("update");
        if (cycle.processedThrough && cycle.processedThrough >= today) return 0;
        if (member.status !== "active") {
          await tx
            .update(savingsPenaltyCycles)
            .set({ processedThrough: today })
            .where(eq(savingsPenaltyCycles.id, cycle.id));
          return 0;
        }
        const [delay] = await tx
          .select()
          .from(penaltyDelayRequests)
          .where(and(eq(penaltyDelayRequests.memberId, member.id), eq(penaltyDelayRequests.period, cycle.period)));
        const [count] = await tx
          .select({ days: sql<number>`count(*)`.mapWith(Number) })
          .from(penaltyAssessments)
          .where(eq(penaltyAssessments.cycleId, cycle.id));
        let chargedDays = count.days,
          added = 0;
        const { penaltiesFrom, dueOn } = savingsWindow(cycle.period);
        let day = cycle.processedThrough ? addDays(cycle.processedThrough, 1) : penaltiesFrom;
        if (day < penaltiesFrom) day = penaltiesFrom;
        while (day <= today && chargedDays < 10) {
          const paused = pausedOn(
            day,
            delay
              ? {
                  status: delay.status,
                  submittedOn: kigaliToday(delay.createdAt),
                  reviewedOn: delay.reviewedAt ? kigaliToday(delay.reviewedAt) : null,
                  deferredUntil: delay.deferredUntil,
                }
              : null,
            activePolicy.pausePending,
          );
          if (!paused) {
            // The day starts at midnight Kigali time. Same-day payments stop the next day's charge.
            const [total] = await tx
              .select({ paid: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)`.mapWith(Number) })
              .from(ledgerEntries)
              .where(
                and(
                  eq(ledgerEntries.memberId, member.id),
                  eq(ledgerEntries.kind, "savings"),
                  eq(ledgerEntries.period, cycle.period),
                  isNull(ledgerEntries.voidedAt),
                  sql`(${ledgerEntries.paidAt} is null or ${ledgerEntries.paidAt} < ${day + "T00:00:00+02:00"}::timestamptz)`,
                ),
              );
            const charge = dailyPenalty(cycle.expectedShares, total.paid, chargedDays, cycle.basis);
            if (charge.amount > 0) {
              const reference = `AUTO-${cycle.id.replaceAll("-", "").slice(0, 16)}-${day.replaceAll("-", "")}`;
              const [fine] = await tx
                .insert(penaltyAssessments)
                .values({
                  reference,
                  memberId: member.id,
                  amount: charge.amount,
                  period: cycle.period,
                  assessedOn: day,
                  reason: `Late savings: ${charge.shares} share(s) × 500 RWF · ${day}`,
                  cycleId: cycle.id,
                  chargeOn: day,
                  chargedShares: charge.shares,
                })
                .onConflictDoNothing()
                .returning();
              if (fine) {
                chargedDays++;
                added++;
                await tx.insert(auditLog).values({
                  action: "penalty.auto_assess",
                  entity: "penalty_assessment",
                  entityId: fine.id,
                  details: {
                    member: member.code,
                    period: cycle.period,
                    day,
                    shares: charge.shares,
                    amount: charge.amount,
                    expectedShares: cycle.expectedShares,
                    paid: total.paid,
                    basis: cycle.basis,
                  },
                });
                await notifyMember(
                  tx,
                  member.id,
                  `penalty:${fine.id}`,
                  "Savings penalty added",
                  "A daily savings penalty has been added. Open Elayo Family to see the amount and your options.",
                );
              }
            }
          }
          day = addDays(day, 1);
        }
        if (today >= penaltiesFrom)
          await tx
            .update(savingsPenaltyCycles)
            .set({ processedThrough: today })
            .where(eq(savingsPenaltyCycles.id, cycle.id));
        if (today === addDays(dueOn, -2)) {
          const [savings] = await tx
            .select({ paid: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)`.mapWith(Number) })
            .from(ledgerEntries)
            .where(
              and(
                eq(ledgerEntries.memberId, member.id),
                eq(ledgerEntries.kind, "savings"),
                eq(ledgerEntries.period, cycle.period),
                isNull(ledgerEntries.voidedAt),
              ),
            );
          if (
            savings.paid < cycle.expectedShares * SHARE_VALUE &&
            (!delay ||
              !pausedOn(
                today,
                {
                  status: delay.status,
                  submittedOn: kigaliToday(delay.createdAt),
                  reviewedOn: delay.reviewedAt ? kigaliToday(delay.reviewedAt) : null,
                  deferredUntil: delay.deferredUntil,
                },
                activePolicy.pausePending,
              ))
          )
            await notifyMember(
              tx,
              member.id,
              `savings-reminder:${cycle.id}`,
              "Savings deadline approaching",
              "Your savings window closes on the 10th. Pay your remaining shares or request a delay in Elayo Family.",
            );
        }
        return added;
      });
    }
  } else {
    // Administratively paused days must not turn into catch-up fines on reactivation.
    await db
      .update(savingsPenaltyCycles)
      .set({ processedThrough: today })
      .where(
        sql`${savingsPenaltyCycles.processedThrough} is null or ${savingsPenaltyCycles.processedThrough} < ${today}`,
      );
  }
  const push = await flushPushNotifications();
  return { created, ...push, enabled: policy.enabled };
}

export async function penaltyAutomationView() {
  const [policy, requests, cycles] = await Promise.all([
    getPenaltyPolicy(),
    db
      .select({
        request: penaltyDelayRequests,
        memberCode: members.code,
        memberName: sql<string>`concat_ws(' ', ${members.firstName}, ${members.surname})`,
      })
      .from(penaltyDelayRequests)
      .innerJoin(members, eq(members.id, penaltyDelayRequests.memberId))
      .orderBy(
        sql`case when ${penaltyDelayRequests.status} = 'pending' then 0 else 1 end`,
        sql`${penaltyDelayRequests.createdAt} desc`,
      )
      .limit(100),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(savingsPenaltyCycles),
  ]);
  return {
    policy,
    pushConfigured: await pushConfigured(),
    cycles: cycles[0].count,
    requests: requests.map(({ request: r, ...m }) => ({
      ...m,
      id: r.id,
      period: r.period,
      reason: r.reason,
      requestedUntil: r.requestedUntil,
      status: r.status,
      deferredUntil: r.deferredUntil,
      reviewNote: r.reviewNote,
      submittedOn: kigaliToday(r.createdAt),
    })),
  };
}
export type PenaltyAutomationData = Awaited<ReturnType<typeof penaltyAutomationView>>;

export async function memberPenaltyPlan(memberId: string) {
  const [policy, requests, cycles, counts] = await Promise.all([
    getPenaltyPolicy(),
    db
      .select()
      .from(penaltyDelayRequests)
      .where(eq(penaltyDelayRequests.memberId, memberId))
      .orderBy(sql`${penaltyDelayRequests.period} desc`)
      .limit(12),
    db
      .select()
      .from(savingsPenaltyCycles)
      .where(eq(savingsPenaltyCycles.memberId, memberId))
      .orderBy(sql`${savingsPenaltyCycles.period} desc`)
      .limit(12),
    db
      .select({ period: penaltyAssessments.period, days: sql<number>`count(*)`.mapWith(Number) })
      .from(penaltyAssessments)
      .where(and(eq(penaltyAssessments.memberId, memberId), sql`${penaltyAssessments.cycleId} is not null`))
      .groupBy(penaltyAssessments.period),
  ]);
  const days = new Map(counts.map((c) => [c.period, c.days]));
  return {
    policy,
    cycles: cycles.map((c) => ({
      period: c.period,
      expectedShares: c.expectedShares,
      chargedDays: days.get(c.period) ?? 0,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      period: r.period,
      reason: r.reason,
      status: r.status,
      requestedUntil: r.requestedUntil,
      deferredUntil: r.deferredUntil,
      reviewNote: r.reviewNote,
    })),
  };
}
export type MemberPenaltyPlan = Awaited<ReturnType<typeof memberPenaltyPlan>>;
