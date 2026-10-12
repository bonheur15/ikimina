import "server-only";
import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, members, settings, users, type LedgerRow } from "@/db/schema";
import { SOCIAL_MONTHLY, kigaliTime, kigaliToday, type AccountState, type Member, type MemberRecord, type MemberTotals, type RecordKind } from "./portal-data";

const COLORS = ["mint", "blue", "violet", "peach"];
const titleCase = (value: string) => value === value.toUpperCase() && /[A-Z]/.test(value)
  ? value.toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase()) : value;

export async function loadPeople(onlyMemberId?: string): Promise<Member[]> {
  const totals = db.select({
    memberId: ledgerEntries.memberId,
    kind: ledgerEntries.kind,
    total: sql<number>`sum(${ledgerEntries.amount})`.mapWith(Number),
  }).from(ledgerEntries).where(isNull(ledgerEntries.voidedAt)).groupBy(ledgerEntries.memberId, ledgerEntries.kind);
  const [rows, sums, accounts] = await Promise.all([
    db.select().from(members).where(onlyMemberId ? eq(members.id, onlyMemberId) : undefined).orderBy(asc(members.status), asc(members.rosterNumber), asc(members.code)),
    onlyMemberId ? totals.having(eq(ledgerEntries.memberId, onlyMemberId)) : totals,
    db.select({ memberId: users.memberId, hasPassword: sql<boolean>`${users.passwordHash} is not null`, blocked: sql<boolean>`${users.disabledAt} is not null` }).from(users),
  ]);
  const byMember = new Map<string, MemberTotals>();
  for (const s of sums) {
    const entry = byMember.get(s.memberId) ?? { savings: 0, social: 0, penalty: 0, interest: 0, adjustment: 0 };
    entry[s.kind as RecordKind] = s.total;
    byMember.set(s.memberId, entry);
  }
  const accountOf = new Map(accounts.filter(a => a.memberId).map(a => [a.memberId!, (a.blocked ? "blocked" : a.hasPassword ? "active" : "invited") as AccountState]));
  return rows.map((m, i) => {
    const name = [m.firstName, m.surname].filter(Boolean).map(part => titleCase(part!)).join(" ");
    const totals = byMember.get(m.id) ?? { savings: 0, social: 0, penalty: 0, interest: 0, adjustment: 0 };
    return {
      id: m.code, name, sheetName: [m.surname, m.firstName].filter(Boolean).map(part => titleCase(part!)).join(" "), initials: name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(),
      district: m.district ?? "", email: m.email ?? "", phone: m.phone ?? "", status: m.status,
      monthlySavings: m.monthlyCommitment ?? 0, interest: totals.interest, totals,
      account: accountOf.get(m.id) ?? "none", color: COLORS[i % COLORS.length],
    };
  });
}

export const toRecord = (row: Pick<LedgerRow, "reference" | "kind" | "amount" | "period" | "paidAt" | "method" | "note" | "source" | "sourceRef">, code: string): MemberRecord => ({
  id: row.reference, memberId: code, type: row.kind, amount: row.amount, period: row.period ?? "",
  date: row.paidAt ? kigaliToday(row.paidAt) : "", time: row.paidAt ? kigaliTime(row.paidAt) : "",
  method: row.method ?? "", note: row.source === "import" ? "" : row.note ?? "", source: row.source, sourceRef: row.sourceRef ?? undefined,
});

export async function loadRecords(memberId?: string): Promise<MemberRecord[]> {
  const rows = await db.select({
    reference: ledgerEntries.reference, kind: ledgerEntries.kind, amount: ledgerEntries.amount, period: ledgerEntries.period,
    paidAt: ledgerEntries.paidAt, method: ledgerEntries.method, note: ledgerEntries.note, source: ledgerEntries.source,
    sourceRef: ledgerEntries.sourceRef, code: members.code,
  }).from(ledgerEntries).innerJoin(members, eq(ledgerEntries.memberId, members.id))
    .where(sql`${ledgerEntries.voidedAt} is null${memberId ? sql` and ${ledgerEntries.memberId} = ${memberId}` : sql``}`)
    .orderBy(sql`${ledgerEntries.period} desc nulls first`, desc(ledgerEntries.paidAt), desc(ledgerEntries.createdAt), desc(ledgerEntries.reference));
  return rows.map(r => toRecord(r, r.code));
}

export async function loadSettings() {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map(r => [r.key, r.value]));
  const social = Number(map.get("socialMonthly"));
  return {
    groupName: typeof map.get("groupName") === "string" ? map.get("groupName") as string : "Elayo Family",
    socialMonthly: Number.isFinite(social) && social > 0 ? social : SOCIAL_MONTHLY,
  };
}
