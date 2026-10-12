import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { currentPeriod, kigaliTime, kigaliToday, SOCIAL_SUPPORT, type AccountState, type CashEntry, type ContributionKind, type Member, type MemberRecord } from "./portal-data";
import type {
  CashbookData, CashFlow, MemberFilter, MembersData, MonthlyAmount, OverviewData, Page, RegisterData, RegisterTab,
  ReportKind, ReportsData, SheetData, SheetRow, YearTotals,
} from "./admin-types";

// Paginated, aggregated queries behind the administrator pages. Totals are computed in SQL so a page
// never needs every member or record in memory. A pageSize of 0 returns all rows (used by CSV exports).

type Row = Record<string, unknown>;
const rows = async (query: SQL) => (await db.execute(query)) as unknown as Row[];
const num = (value: unknown) => value == null ? 0 : Number(value);
const str = (value: unknown) => value == null ? "" : String(value);
const limitSql = (page: number, pageSize: number) => pageSize ? sql`limit ${pageSize} offset ${(page - 1) * pageSize}` : sql``;
const pageOf = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({ rows: items, total, page, pageSize: pageSize || total });

const COLORS = ["mint", "blue", "violet", "peach"];
const titleCase = (value: string) => value === value.toUpperCase() && /[A-Z]/.test(value)
  ? value.toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase()) : value;
export const memberName = (first: unknown, surname: unknown) => [first, surname].filter(Boolean).map(part => titleCase(String(part))).join(" ");
/** Surname first, the way members are listed in the Excel registers. */
export const surnameFirst = (first: unknown, surname: unknown) => memberName(surname, first);

/** Escapes LIKE wildcards in user input. */
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
const memberSearch = (q: string) => q
  ? sql`(m.code ilike ${pattern(q)} or concat_ws(' ', m.first_name, m.surname) ilike ${pattern(q)} or concat_ws(' ', m.surname, m.first_name) ilike ${pattern(q)} or m.email ilike ${pattern(q)} or m.phone ilike ${pattern(q)} or m.district ilike ${pattern(q)})`
  : sql`true`;

// ---------------------------------------------------------------- members

const MEMBER_COLUMNS = sql`
  m.id, m.code, m.surname, m.first_name, m.email, m.phone, m.district, m.status, m.monthly_commitment,
  coalesce(t.savings, 0)::float8 as savings, coalesce(t.social, 0)::float8 as social, coalesce(t.penalty, 0)::float8 as penalty,
  coalesce(t.interest, 0)::float8 as interest, coalesce(t.adjustment, 0)::float8 as adjustment,
  case when u.id is null then 'none' when u.disabled_at is not null then 'blocked' when u.password_hash is not null then 'active' else 'invited' end as account`;
const MEMBER_JOINS = sql`
  left join lateral (
    select sum(amount) filter (where kind = 'savings') as savings, sum(amount) filter (where kind = 'social') as social,
      sum(amount) filter (where kind = 'penalty') as penalty, sum(amount) filter (where kind = 'interest') as interest,
      sum(amount) filter (where kind = 'adjustment') as adjustment
    from ledger_entries l where l.member_id = m.id and l.voided_at is null
  ) t on true
  left join users u on u.member_id = m.id`;
const MEMBER_ORDER = sql`order by m.status, m.roster_number nulls last, m.code`;

export function toMember(r: Row, index = 0): Member {
  const name = memberName(r.first_name, r.surname) || str(r.code);
  return {
    id: str(r.code), name, sheetName: surnameFirst(r.first_name, r.surname) || str(r.code), initials: name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase(),
    district: str(r.district), email: str(r.email), phone: str(r.phone), status: r.status === "former" ? "former" : "active",
    monthlySavings: num(r.monthly_commitment), interest: num(r.interest),
    totals: { savings: num(r.savings), social: num(r.social), penalty: num(r.penalty), interest: num(r.interest), adjustment: num(r.adjustment) },
    account: str(r.account) as AccountState, color: COLORS[index % COLORS.length],
  };
}

const MEMBER_FILTER_SQL: Record<MemberFilter, SQL> = {
  all: sql`m.status = 'active'`,
  former: sql`m.status = 'former'`,
  missing: sql`m.status = 'active' and coalesce(m.email, '') = ''`,
  "no-account": sql`m.status = 'active' and (u.id is null or u.password_hash is null or u.disabled_at is not null)`,
};

export async function queryMembers(where: SQL, page = 1, pageSize = 0) {
  const [list, [{ total }]] = await Promise.all([
    rows(sql`select ${MEMBER_COLUMNS} from members m ${MEMBER_JOINS} where ${where} ${MEMBER_ORDER} ${limitSql(page, pageSize)}`),
    rows(sql`select count(*)::int as total from members m left join users u on u.member_id = m.id where ${where}`),
  ]);
  return pageOf(list.map((r, i) => toMember(r, i)), num(total), page, pageSize);
}

export async function loadMembersPage(filter: MemberFilter, q: string, page: number, pageSize = 25): Promise<MembersData> {
  const [result, [counts]] = await Promise.all([
    queryMembers(sql`${MEMBER_FILTER_SQL[filter]} and ${memberSearch(q)}`, page, pageSize),
    rows(sql`select
      count(*) filter (where ${MEMBER_FILTER_SQL.all})::int as all,
      count(*) filter (where ${MEMBER_FILTER_SQL.missing})::int as missing,
      count(*) filter (where ${MEMBER_FILTER_SQL["no-account"]})::int as no_account,
      count(*) filter (where ${MEMBER_FILTER_SQL.former})::int as former
      from members m left join users u on u.member_id = m.id where ${memberSearch(q)}`),
  ]);
  return { filter, q, page: result, counts: { all: num(counts.all), missing: num(counts.missing), "no-account": num(counts.no_account), former: num(counts.former) } };
}

/** Members matching a search, for pickers. */
export async function searchMembers(q: string, limit = 20) {
  const exact = q ? sql`upper(m.code) = ${q.trim().toUpperCase()} desc,` : sql``;
  const list = await rows(sql`select ${MEMBER_COLUMNS} from members m ${MEMBER_JOINS}
    where m.status = 'active' and ${memberSearch(q.trim())} order by ${exact} m.roster_number nulls last, m.code limit ${limit}`);
  return list.map((r, i) => toMember(r, i));
}

export async function loadMember(code: string) {
  const [member] = await rows(sql`select ${MEMBER_COLUMNS} from members m ${MEMBER_JOINS} where m.code = ${code}`);
  return member ? toMember(member) : null;
}

// ---------------------------------------------------------------- records

const RECORD_COLUMNS = sql`l.reference, l.kind, l.amount::float8 as amount, l.period, l.paid_at, l.method, l.note, l.source, l.source_ref, m.code, m.first_name, m.surname`;
const RECORD_ORDER = sql`order by l.period desc nulls first, l.paid_at desc nulls last, l.created_at desc, l.reference desc`;

export function rowToRecord(r: Row): MemberRecord {
  const paidAt = r.paid_at ? new Date(r.paid_at as string) : null;
  return {
    id: str(r.reference), memberId: str(r.code), memberName: memberName(r.first_name, r.surname), memberSheetName: surnameFirst(r.first_name, r.surname), type: r.kind as MemberRecord["type"],
    amount: num(r.amount), period: str(r.period), date: paidAt ? kigaliToday(paidAt) : "", time: paidAt ? kigaliTime(paidAt) : "",
    method: str(r.method), note: r.source === "import" ? "" : str(r.note), source: r.source === "import" ? "import" : "manual",
    sourceRef: r.source_ref ? str(r.source_ref) : undefined,
  };
}

export async function recentRecords(limit: number, memberId?: string) {
  const list = await rows(sql`select ${RECORD_COLUMNS} from ledger_entries l join members m on m.id = l.member_id
    where l.voided_at is null and l.period is not null and l.kind <> 'interest' ${memberId ? sql`and l.member_id = ${memberId}` : sql``}
    ${RECORD_ORDER} limit ${limit}`);
  return list.map(rowToRecord);
}

export async function memberRecordsFor(memberId: string) {
  const list = await rows(sql`select ${RECORD_COLUMNS} from ledger_entries l join members m on m.id = l.member_id
    where l.voided_at is null and l.member_id = ${memberId} ${RECORD_ORDER}`);
  return list.map(rowToRecord);
}

/** Net savings movement (contributions and adjustments) per month, for balance charts. */
export async function savingsSeries(memberId?: string): Promise<MonthlyAmount[]> {
  const list = await rows(sql`select coalesce(period, '') as period, sum(amount)::float8 as amount from ledger_entries
    where voided_at is null and kind in ('savings', 'adjustment') ${memberId ? sql`and member_id = ${memberId}` : sql``}
    group by 1 order by 1`);
  return list.map(r => ({ period: str(r.period), amount: num(r.amount) }));
}

// ---------------------------------------------------------------- overview

export async function loadOverview(): Promise<OverviewData> {
  const [[totals], [latest], recent, series, [people], [support]] = await Promise.all([
    rows(sql`select
      coalesce(sum(amount) filter (where kind in ('savings', 'adjustment')), 0)::float8 as principal,
      coalesce(sum(amount) filter (where kind = 'social'), 0)::float8 as social,
      max(period) filter (where kind = 'savings') as latest_period,
      max(substr(period, 1, 4)) filter (where kind = 'interest') as interest_year
      from ledger_entries where voided_at is null`),
    rows(sql`with latest as (select max(period) as p from ledger_entries where voided_at is null and kind = 'savings'),
      interest_year as (select max(substr(period, 1, 4)) as y from ledger_entries where voided_at is null and kind = 'interest')
      select
        coalesce((select sum(amount) from ledger_entries, latest where voided_at is null and kind = 'savings' and period = latest.p), 0)::float8 as latest_savings,
        coalesce((select sum(amount) from ledger_entries, interest_year where voided_at is null and kind = 'interest' and substr(period, 1, 4) = interest_year.y), 0)::float8 as interest_total,
        (select count(*) from members m where m.status = 'active' and coalesce(m.monthly_commitment, 0) > 0)::int as expected,
        (select count(*) from members m where m.status = 'active' and coalesce(m.monthly_commitment, 0) > 0 and m.monthly_commitment <= coalesce(
          (select sum(amount) from ledger_entries l, latest where l.member_id = m.id and l.voided_at is null and l.kind = 'savings' and l.period = latest.p), 0))::int as met`),
    recentRecords(5),
    savingsSeries(),
    rows(sql`select count(*) filter (where m.status = 'active')::int as active,
      count(*) filter (where m.status = 'active' and coalesce(m.email, '') = '')::int as missing_email,
      count(*) filter (where m.status = 'active' and u.password_hash is not null and u.disabled_at is null)::int as accounts_ready
      from members m left join users u on u.member_id = m.id`),
    rows(sql`select coalesce(sum(money_out), 0)::float8 as total from cashbook_entries where voided_at is null and category = ${SOCIAL_SUPPORT}`),
  ]);
  return {
    activeCount: num(people.active), principal: num(totals.principal), latestPeriod: str(totals.latest_period), latestSavings: num(latest.latest_savings),
    participation: { expected: num(latest.expected), met: num(latest.met) },
    socialTotal: num(totals.social), supportTotal: num(support.total), interestYear: str(totals.interest_year), interestTotal: num(latest.interest_total),
    accountsReady: num(people.accounts_ready), missingEmail: num(people.missing_email), recent, series,
  };
}

// ---------------------------------------------------------------- registers

const recordSearch = (q: string) => q
  ? sql`(${memberSearch(q)} or l.reference ilike ${pattern(q)} or l.note ilike ${pattern(q)} or l.method ilike ${pattern(q)})`
  : sql`true`;

export async function loadRegister(kind: ContributionKind, opts: { tab: RegisterTab; period: string; q: string; page: number; year: string; pageSize?: number }): Promise<RegisterData> {
  const { tab, q, page } = opts;
  const periods = (await rows(sql`select distinct period from ledger_entries where kind = ${kind} and voided_at is null and period is not null order by period desc`)).map(r => str(r.period));
  const period = opts.period === "all" || periods.includes(opts.period) ? opts.period : periods[0] ?? "all";
  const inPeriod = period === "all" ? sql`true` : sql`l.period = ${period}`;
  const where = sql`l.kind = ${kind} and l.voided_at is null and ${inPeriod} and ${recordSearch(q)}`;

  const [[stats], [kindTotal], support] = await Promise.all([
    rows(sql`select coalesce(sum(l.amount), 0)::float8 as total, count(*)::int as count, count(distinct l.member_id)::int as contributors
      from ledger_entries l join members m on m.id = l.member_id where ${where}`),
    rows(sql`select coalesce(sum(amount), 0)::float8 as total from ledger_entries where kind = ${kind} and voided_at is null`),
    kind === "social" ? cashbookRows(sql`category = ${SOCIAL_SUPPORT} and money_out > 0`, 1, 20) : Promise.resolve(pageOf<CashEntry>([], 0, 1, 0)),
  ]);
  const base: RegisterData = {
    kind, tab, period, q, months: periods,
    stats: { total: num(stats.total), count: num(stats.count), contributors: num(stats.contributors) },
    kindTotal: num(kindTotal.total), supportTotal: support.rows.reduce((s, e) => s + e.moneyOut, 0), support: support.rows,
  };

  if (tab === "payments") {
    const pageSize = opts.pageSize ?? 25;
    const list = await rows(sql`select ${RECORD_COLUMNS} from ledger_entries l join members m on m.id = l.member_id where ${where} ${RECORD_ORDER} ${limitSql(page, pageSize)}`);
    return { ...base, payments: pageOf(list.map(rowToRecord), base.stats.count, page, pageSize) };
  }
  if (tab === "members") {
    const pageSize = opts.pageSize ?? 25;
    const memberWhere = sql`(m.status = 'active' or exists (select 1 from ledger_entries l where l.member_id = m.id and l.kind = ${kind} and l.voided_at is null and ${inPeriod})) and ${memberSearch(q)}`;
    const result = await queryMembers(memberWhere, page, pageSize);
    const codes = result.rows.map(m => m.id);
    const paid = codes.length ? await rows(sql`select m.code, coalesce(sum(l.amount), 0)::float8 as paid, count(*)::int as count
      from ledger_entries l join members m on m.id = l.member_id
      where l.kind = ${kind} and l.voided_at is null and ${inPeriod} and m.code in ${codes} group by m.code`) : [];
    const byCode = new Map(paid.map(r => [str(r.code), r]));
    return { ...base, summary: { ...result, rows: result.rows.map(member => ({ member, paid: num(byCode.get(member.id)?.paid), count: num(byCode.get(member.id)?.count) })) } };
  }
  return { ...base, sheet: await loadSheet(kind, opts.year, q, page, opts.pageSize ?? 30, periods) };
}

/** Members × months matrix for one register, one page of members at a time. */
async function loadSheet(kind: ContributionKind, requestedYear: string, q: string, page: number, pageSize: number, periods: string[]): Promise<SheetData> {
  const first = periods.at(-1) ?? currentPeriod();
  const last = [periods[0] ?? "", currentPeriod()].sort().at(-1)!;
  const allMonths: string[] = [];
  for (let [y, m] = first.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= last; m === 12 ? (y++, m = 1) : m++) allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
  const years = [...new Set(allMonths.map(p => p.slice(0, 4)))].reverse();
  const year = years.includes(requestedYear) ? requestedYear : "all";
  const months = year === "all" ? allMonths : allMonths.filter(p => p.startsWith(year));
  const inYear = year === "all" ? sql`true` : sql`substr(l.period, 1, 4) = ${year}`;

  const memberWhere = sql`(m.status = 'active' or exists (select 1 from ledger_entries l where l.member_id = m.id and l.kind = ${kind} and l.voided_at is null)) and ${memberSearch(q)}`;
  const [members, columnRows] = await Promise.all([
    rows(sql`select m.id, m.code, m.first_name, m.surname, m.status, count(*) over ()::int as total_count from members m where ${memberWhere} ${MEMBER_ORDER} ${limitSql(page, pageSize)}`),
    rows(sql`select l.period, sum(l.amount)::float8 as amount from ledger_entries l join members m on m.id = l.member_id
      where l.kind = ${kind} and l.voided_at is null and l.period is not null and ${inYear} and ${memberWhere} group by l.period`),
  ]);
  const ids = members.map(m => str(m.id));
  const cells = ids.length ? await rows(sql`select l.member_id, l.period, sum(l.amount)::float8 as amount, count(*)::int as count,
      (array_agg(l.reference order by l.paid_at desc nulls last, l.created_at desc))[1] as ref
    from ledger_entries l where l.kind = ${kind} and l.voided_at is null and l.period is not null and ${inYear} and l.member_id in ${ids}
    group by l.member_id, l.period`) : [];
  const byMember = new Map<string, SheetRow["cells"]>();
  for (const c of cells) {
    const map = byMember.get(str(c.member_id)) ?? {};
    map[str(c.period)] = { amount: num(c.amount), count: num(c.count), ref: str(c.ref) };
    byMember.set(str(c.member_id), map);
  }
  const sheetRows: SheetRow[] = members.map(m => {
    const own = byMember.get(str(m.id)) ?? {};
    return {
      member: { id: str(m.code), name: surnameFirst(m.first_name, m.surname) || str(m.code), status: m.status === "former" ? "former" : "active" },
      cells: own, total: Object.values(own).reduce((s, c) => s + c.amount, 0),
    };
  });
  const columnTotals = Object.fromEntries(columnRows.map(r => [str(r.period), num(r.amount)]));
  return {
    year, years, months, columnTotals, grandTotal: Object.values(columnTotals).reduce((s, v) => s + v, 0),
    page: pageOf(sheetRows, num(members[0]?.total_count), page, pageSize),
  };
}

// ---------------------------------------------------------------- cashbook

/** Cashbook rows in book order with running balance and year (undated rows take the year of the entry before them). */
const CASHBOOK_CTE = sql`with ordered as (
    select c.*, sum(c.money_in - c.money_out) over (order by c.position) as balance,
      count(c.entry_date) over (order by c.position) as grp
    from cashbook_entries c where c.voided_at is null),
  yeared as (select o.*, coalesce(max(extract(year from o.entry_date)::int) over (partition by o.grp)::text, '—') as yr from ordered o)`;

function toCashEntry(r: Row): CashEntry {
  return {
    id: str(r.id), position: num(r.position), date: r.entry_date ? str(r.entry_date).slice(0, 10) : "", dateText: str(r.date_text),
    dateInferred: !!r.date_inferred, description: str(r.description), moneyIn: num(r.money_in), moneyOut: num(r.money_out),
    balance: num(r.balance), sourceBalance: r.source_balance == null ? null : num(r.source_balance), category: str(r.category),
    comment: str(r.comment), source: r.source === "import" ? "import" : "manual",
  };
}

async function cashbookRows(where: SQL, page: number, pageSize: number, order: "asc" | "desc" = "desc") {
  const list = await rows(sql`${CASHBOOK_CTE} select *, count(*) over ()::int as total_count from yeared where ${where}
    order by position ${order === "asc" ? sql`asc` : sql`desc`} ${limitSql(page, pageSize)}`);
  return pageOf(list.map(toCashEntry), num(list[0]?.total_count), page, pageSize);
}

/** `order` "asc" lists entries in book order (sheet view and reports); "desc" lists the newest first. */
export async function loadCashbook(requestedYear: string, flow: CashFlow, page: number, pageSize = 30, order: "asc" | "desc" = "desc"): Promise<CashbookData> {
  const years = (await rows(sql`${CASHBOOK_CTE} select distinct yr from yeared order by yr desc`)).map(r => str(r.yr));
  const year = requestedYear === "all" || years.includes(requestedYear) ? requestedYear : years[0] ?? "all";
  const inYear = year === "all" ? sql`true` : sql`yr = ${year}`;
  const flowSql = flow === "in" ? sql`money_in > 0` : flow === "out" ? sql`money_out > 0` : sql`true`;
  const [[summary], list] = await Promise.all([
    rows(sql`${CASHBOOK_CTE} select coalesce(min(balance - money_in + money_out) filter (where position = (select min(position) from yeared where ${inYear})), 0)::float8 as opening,
      coalesce(sum(money_in), 0)::float8 as money_in, coalesce(sum(money_out), 0)::float8 as money_out, count(*)::int as entries
      from yeared where ${inYear}`),
    cashbookRows(sql`${inYear} and ${flowSql}`, page, pageSize, order),
  ]);
  const opening = num(summary.opening), moneyIn = num(summary.money_in), moneyOut = num(summary.money_out);
  return { year, flow, years, view: order === "asc" ? "sheet" : "entries", summary: { opening, moneyIn, moneyOut, closing: opening + moneyIn - moneyOut, entries: num(summary.entries) }, page: list };
}

// ---------------------------------------------------------------- reports

export async function loadReports(report: ReportKind, requestedPeriod: string, interestYearParam: string, page: number, pageSize = 25): Promise<ReportsData> {
  const byYearRows = await rows(sql`select substr(period, 1, 4) as year,
      coalesce(sum(amount) filter (where kind = 'savings'), 0)::float8 as savings, coalesce(sum(amount) filter (where kind = 'social'), 0)::float8 as social,
      coalesce(sum(amount) filter (where kind = 'penalty'), 0)::float8 as penalty, coalesce(sum(amount) filter (where kind = 'interest'), 0)::float8 as interest,
      coalesce(sum(amount) filter (where kind = 'adjustment'), 0)::float8 as adjustment
    from ledger_entries where voided_at is null and period is not null group by 1 order by 1 desc`);
  const byYear: YearTotals[] = byYearRows.map(r => ({ year: str(r.year), savings: num(r.savings), social: num(r.social), penalty: num(r.penalty), interest: num(r.interest), adjustment: num(r.adjustment) }));
  const years = byYear.map(y => y.year);
  const period = requestedPeriod === "all" || years.includes(requestedPeriod) ? requestedPeriod : years[0] ?? "all";
  const selected = byYear.filter(y => period === "all" || y.year === period);
  const sum = (k: keyof Omit<YearTotals, "year">) => selected.reduce((s, y) => s + y[k], 0);
  const [{ spending }] = await rows(sql`${CASHBOOK_CTE} select coalesce(sum(money_out), 0)::float8 as spending from yeared where ${period === "all" ? sql`true` : sql`yr = ${period}`}`);
  const data: ReportsData = {
    report, period, years, byYear,
    financial: { year: period, savings: sum("savings"), social: sum("social"), penalty: sum("penalty"), interest: sum("interest"), adjustment: sum("adjustment"), spending: num(spending) },
  };
  if (report === "members") {
    const where = sql`(m.status = 'active' or exists (select 1 from ledger_entries l where l.member_id = m.id and l.voided_at is null and l.kind in ('savings', 'adjustment')))`;
    const [result, [{ total }]] = await Promise.all([
      queryMembers(where, page, pageSize),
      rows(sql`select coalesce(sum(amount), 0)::float8 as total from ledger_entries where voided_at is null and kind in ('savings', 'adjustment')`),
    ]);
    data.balances = { page: result, totalPrincipal: num(total) };
  }
  if (report === "interest") {
    const interestYears = (await rows(sql`select distinct substr(period, 1, 4) as y from ledger_entries where kind = 'interest' and voided_at is null and period is not null order by 1 desc`)).map(r => str(r.y));
    const year = interestYears.includes(interestYearParam) ? interestYearParam : interestYears[0] ?? "";
    const allocated = sql`(select sum(l.amount) from ledger_entries l where l.member_id = m.id and l.voided_at is null and l.kind = 'interest' and substr(l.period, 1, 4) = ${year})`;
    const [list, [{ total, count }]] = await Promise.all([
      rows(sql`select ${MEMBER_COLUMNS}, ${allocated}::float8 as allocated from members m ${MEMBER_JOINS} where ${allocated} <> 0 ${MEMBER_ORDER} ${limitSql(page, pageSize)}`),
      rows(sql`select coalesce(sum(amount), 0)::float8 as total, count(distinct member_id)::int as count from ledger_entries
        where voided_at is null and kind = 'interest' and substr(period, 1, 4) = ${year}`),
    ]);
    data.interest = { year, years: interestYears, total: num(total), page: pageOf(list.map((r, i) => ({ member: toMember(r, i), amount: num(r.allocated) })), num(count), page, pageSize) };
  }
  return data;
}

// ---------------------------------------------------------------- report helpers

/** Contributions per month of one year, with the number of members who saved that month. */
export async function monthlyCollections(year: string) {
  const list = await rows(sql`select period,
      coalesce(sum(amount) filter (where kind = 'savings'), 0)::float8 as savings, coalesce(sum(amount) filter (where kind = 'social'), 0)::float8 as social,
      coalesce(sum(amount) filter (where kind = 'penalty'), 0)::float8 as penalty, count(distinct member_id) filter (where kind = 'savings')::int as savers
    from ledger_entries where voided_at is null and kind in ('savings', 'social', 'penalty') and substr(period, 1, 4) = ${year}
    group by period order by period`);
  return list.map(r => ({ period: str(r.period), savings: num(r.savings), social: num(r.social), penalty: num(r.penalty), savers: num(r.savers) }));
}

/** Petty-cash money in and out per book year. */
export async function cashByYear() {
  const list = await rows(sql`${CASHBOOK_CTE} select yr, coalesce(sum(money_in), 0)::float8 as money_in, coalesce(sum(money_out), 0)::float8 as money_out from yeared group by yr`);
  return new Map(list.map(r => [str(r.yr), { moneyIn: num(r.money_in), moneyOut: num(r.money_out) }]));
}

/** Petty-cash totals per category for one book year or all years. */
export async function cashByCategory(year: string) {
  const list = await rows(sql`${CASHBOOK_CTE} select coalesce(nullif(category, ''), '') as category, count(*)::int as entries,
      coalesce(sum(money_in), 0)::float8 as money_in, coalesce(sum(money_out), 0)::float8 as money_out
    from yeared where ${year === "all" ? sql`true` : sql`yr = ${year}`} group by 1 order by money_out desc, money_in desc`);
  return list.map(r => ({ category: str(r.category), entries: num(r.entries), moneyIn: num(r.money_in), moneyOut: num(r.money_out) }));
}

/** Year lists used by report filters. */
export async function reportOptions() {
  const [years, interestYears, cashYears, months] = await Promise.all([
    rows(sql`select distinct substr(period, 1, 4) as y from ledger_entries where voided_at is null and period is not null order by 1 desc`),
    rows(sql`select distinct substr(period, 1, 4) as y from ledger_entries where voided_at is null and kind = 'interest' and period is not null order by 1 desc`),
    rows(sql`${CASHBOOK_CTE} select distinct yr as y from yeared order by 1 desc`),
    rows(sql`select kind, array_agg(distinct period order by period desc) as months from ledger_entries
      where voided_at is null and period is not null and kind in ('savings', 'social', 'penalty') group by kind`),
  ]);
  return {
    years: years.map(r => str(r.y)), interestYears: interestYears.map(r => str(r.y)), cashYears: cashYears.map(r => str(r.y)),
    months: Object.fromEntries(months.map(r => [str(r.kind), (r.months as string[]) ?? []])) as Record<ContributionKind, string[]>,
  };
}
