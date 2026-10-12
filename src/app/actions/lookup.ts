"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { canReadGroup } from "@/lib/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { loadMember, memberRecordsFor, recentRecords, rowToRecord, searchMembers } from "@/lib/admin-queries";
import type { Member, MemberRecord } from "@/lib/portal-data";

// Read-only lookups loaded on demand (dialogs, pickers), so pages never ship every record up front.
// Administrators can read any member; members only their own records.

export type RecordDetailData = {
  record: MemberRecord;
  member: { id: string; name: string };
  balanceAfter: number | null;
};

export async function getRecordDetail(reference: string): Promise<RecordDetailData | null> {
  const viewer = await getViewer();
  if (!viewer || typeof reference !== "string" || reference.length > 40) return null;
  const [row] =
    (await db.execute(sql`select l.reference, l.kind, l.amount::float8 as amount, l.period, l.paid_at, l.method, l.note, l.source,
      l.source_ref, l.member_id, l.created_at, m.code, m.first_name, m.surname
    from ledger_entries l join members m on m.id = l.member_id where l.reference = ${reference} and l.voided_at is null`)) as unknown as Record<
      string,
      unknown
    >[];
  if (!row) return null;
  if (!canReadGroup(viewer.role) && viewer.member?.id !== row.member_id) return null;
  const record = rowToRecord(row);
  let balanceAfter: number | null = null;
  if (record.type === "savings" || record.type === "adjustment") {
    // Same ordering as the member's history: by month, then payment time; undated adjustments last.
    const [{ balance }] = (await db.execute(sql`select coalesce(sum(amount), 0)::float8 as balance from ledger_entries
      where member_id = ${row.member_id as string} and voided_at is null and kind in ('savings', 'adjustment')
      and (coalesce(period, '9999'), coalesce(paid_at, 'epoch'::timestamptz), reference)
        <= (coalesce(${record.period || null}, '9999'), coalesce(${row.paid_at as string | null}::timestamptz, 'epoch'::timestamptz), ${record.id})`)) as unknown as {
      balance: number;
    }[];
    balanceAfter = Number(balance);
  }
  return { record, member: { id: record.memberId, name: record.memberName ?? record.memberId }, balanceAfter };
}

export async function getMemberDetail(code: string): Promise<{ member: Member; records: MemberRecord[] } | null> {
  const viewer = await getViewer();
  if (!canReadGroup(viewer?.role) || typeof code !== "string") return null;
  const member = await loadMember(code);
  if (!member) return null;
  const [row] = (await db.execute(sql`select id from members where code = ${code}`)) as unknown as { id: string }[];
  return { member, records: await memberRecordsFor(row.id) };
}

export async function findMembers(q: string): Promise<Member[]> {
  const viewer = await getViewer();
  if (!canReadGroup(viewer?.role)) return [];
  return searchMembers(String(q ?? "").slice(0, 80));
}

export async function recentActivity(): Promise<MemberRecord[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  if (canReadGroup(viewer.role)) return recentRecords(5);
  return viewer.member ? recentRecords(5, viewer.member.id) : [];
}
