import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { PenaltyAssessment, PenaltyAssessmentData } from "./penalty-types";

const penaltyRows = sql`select p.id, p.reference, m.code as member_code,
  concat_ws(' ', m.first_name, m.surname) as member_name, p.amount::float8 as amount,
  p.period, p.assessed_on::text, p.reason, coalesce(paid.amount, 0)::float8 as paid,
  greatest(p.amount - coalesce(paid.amount, 0), 0)::float8 as remaining
  from penalty_assessments p join members m on m.id = p.member_id
  left join (select penalty_assessment_id, sum(amount) as amount from ledger_entries
    where voided_at is null and kind = 'penalty' group by penalty_assessment_id) paid on paid.penalty_assessment_id = p.id
  where p.voided_at is null`;

const toPenalty = (r: Record<string, unknown>): PenaltyAssessment => ({
  id: String(r.id),
  reference: String(r.reference),
  memberCode: String(r.member_code),
  memberName: String(r.member_name),
  amount: Number(r.amount),
  paid: Number(r.paid),
  remaining: Number(r.remaining),
  period: String(r.period),
  assessedOn: String(r.assessed_on),
  reason: String(r.reason),
});

export async function loadPenaltyAssessments({
  q = "",
  period = "all",
  page = 1,
  status = "outstanding",
}: {
  q?: string;
  period?: string;
  page?: number;
  status?: PenaltyAssessmentData["status"];
}): Promise<PenaltyAssessmentData> {
  const search = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = sql`${period === "all" ? sql`true` : sql`period = ${period}`} and
    ${q ? sql`(member_code ilike ${search} or member_name ilike ${search} or reference ilike ${search} or reason ilike ${search})` : sql`true`}`;
  const state = status === "all" ? sql`true` : status === "settled" ? sql`remaining = 0` : sql`remaining > 0`;
  const [totals] = (await db.execute(sql`with penalties as (${penaltyRows}) select
    count(*) filter (where ${state})::int as count,
    coalesce(sum(remaining), 0)::float8 as outstanding, count(*) filter (where remaining > 0)::int as outstanding_count
    from penalties where ${where}`)) as unknown as Record<string, unknown>[];
  const pageSize = 20,
    total = Number(totals.count);
  const currentPage = Math.min(Math.max(page, 1), Math.max(1, Math.ceil(total / pageSize)));
  const rows =
    (await db.execute(sql`with penalties as (${penaltyRows}) select * from penalties where ${where} and ${state}
    order by assessed_on desc, reference desc limit ${pageSize} offset ${(currentPage - 1) * pageSize}`)) as unknown as Record<
      string,
      unknown
    >[];
  return {
    page: { rows: rows.map(toPenalty), total, page: currentPage, pageSize },
    outstanding: Number(totals.outstanding),
    outstandingCount: Number(totals.outstanding_count),
    status,
  };
}

/** The caller supplies the signed-in member's UUID; no other member's penalties are returned. */
export async function loadMemberPenalties(memberId: string): Promise<PenaltyAssessment[]> {
  const rows = (await db.execute(sql`with penalties as (${penaltyRows} and p.member_id = ${memberId})
    select * from penalties where remaining > 0 order by assessed_on desc, reference desc`)) as unknown as Record<
    string,
    unknown
  >[];
  return rows.map(toPenalty);
}
