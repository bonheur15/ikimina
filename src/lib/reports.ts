import "server-only";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import {
  cashByCategory, cashByYear, loadCashbook, loadMember, loadMembersPage, loadRegister, loadReports, memberRecordsFor,
  monthlyCollections, queryMembers, reportOptions, searchMembers,
} from "./admin-queries";
import { CASH_FLOWS, MEMBER_FILTERS, type CashFlow, type MemberFilter } from "./admin-types";
import { latestImportSummary } from "./workbooks";
import { SHARE_VALUE, affectsSavings, chronological, kigaliToday, principalOf, type ContributionKind } from "./portal-data";
import { reportMeta, type ReportCell, type ReportColumn, type ReportOptions, type ReportTable } from "./report-catalog";

// Builds the reports in report-catalog.ts. The same builder serves the paginated preview
// (page/pageSize) and the downloads (pageSize 0 = every row).

type Lang = "en" | "rw";
type Params = Record<string, string>;
type Built = { table: ReportTable; params: Params };
const KINDS: ContributionKind[] = ["savings", "social", "penalty"];
const MAX_ROWS = 20_000;

const slice = <T>(items: T[], page: number, pageSize: number) => pageSize ? items.slice((page - 1) * pageSize, page * pageSize) : items;
const pick = <T extends string>(value: string | undefined, options: readonly T[], fallback: T) => options.includes(value as T) ? value as T : fallback;
const monthName = (period: string, lang: Lang) => new Intl.DateTimeFormat(lang === "rw" ? "rw-RW" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-15T00:00:00Z`));

export async function buildReport(id: string, input: Params, { page = 1, pageSize = 50, lang = "en" as Lang } = {}): Promise<Built | null> {
  const meta = reportMeta(id);
  if (!meta) return null;
  const L = (en: string, rw: string) => lang === "rw" ? rw : en;
  const options = await reportOptions();
  const kindLabel = (kind: ContributionKind) => kind === "savings" ? L("Savings", "Ubwizigame") : kind === "social" ? L("Social fund", "Ingoboka") : L("Penalties", "Amande");
  const scopeLabel = (period: string) => period === "all" ? L("All years", "Imyaka yose") : period;
  const base = (title: string, subtitle: string, columns: ReportColumn[], rows: Record<string, ReportCell>[], total: number, extra: Partial<ReportTable> = {}): ReportTable =>
    ({ title, subtitle, columns, rows, total, page, pageSize: pageSize || total, ...extra });
  const title = lang === "rw" ? meta.rw[0] : meta.en[0];

  switch (id) {
    case "financial-summary": {
      const period = input.period === "all" || options.years.includes(input.period) ? input.period : options.years[0] ?? "all";
      const { financial: f } = await loadReports("financial", period, "", 1, 0);
      const rows = [
        { item: L("Savings contributions", "Imisanzu y’ubwizigame"), amount: f.savings },
        { item: L("Social fund contributions", "Imisanzu y’ingoboka"), amount: f.social },
        { item: L("Penalty payments", "Ubwishyu bw’amande"), amount: f.penalty },
        { item: L("Total contributions received", "Imisanzu yose yakiriwe"), amount: f.savings + f.social + f.penalty },
        { item: L("Withdrawals and deductions", "Ayakuweho"), amount: f.adjustment },
        { item: L("Interest allocated to members", "Inyungu zagenewe abanyamuryango"), amount: f.interest },
        { item: L("Petty-cash spending", "Ayasohotse mu mafaranga mato"), amount: f.spending },
      ];
      return { params: { period }, table: base(title, scopeLabel(period), [{ key: "item", label: L("Item", "Ikiciro"), type: "text", width: 320 }, { key: "amount", label: L("Amount (RWF)", "Amafaranga (RWF)"), type: "money", width: 160 }], rows, rows.length,
        { notes: [L("By contribution month. Spending covers the petty-cash book only.", "Ukurikije ukwezi k’umusanzu. Ayasohotse ni ay’igitabo cy’amafaranga mato gusa.")] }) };
    }
    case "yearly-comparison": {
      const [{ byYear }, cash] = await Promise.all([loadReports("financial", "all", "", 1, 0), cashByYear()]);
      const rows = byYear.map(y => ({ year: y.year, savings: y.savings, social: y.social, penalty: y.penalty, adjustment: y.adjustment, interest: y.interest, spending: cash.get(y.year)?.moneyOut ?? 0 }));
      const sum = (k: keyof typeof rows[number]) => rows.reduce((s, r) => s + Number(r[k]), 0);
      return { params: {}, table: base(title, L("All years", "Imyaka yose"), [
        { key: "year", label: L("Year", "Umwaka"), type: "text", width: 80 }, { key: "savings", label: L("Savings", "Ubwizigame"), type: "money" },
        { key: "social", label: L("Social fund", "Ingoboka"), type: "money" }, { key: "penalty", label: L("Penalties", "Amande"), type: "money" },
        { key: "adjustment", label: L("Withdrawals", "Ayakuweho"), type: "money" }, { key: "interest", label: L("Interest", "Inyungu"), type: "money" },
        { key: "spending", label: L("Petty-cash spending", "Ayasohotse"), type: "money" },
      ], slice(rows, page, pageSize), rows.length, { totals: { year: L("Total", "Igiteranyo"), savings: sum("savings"), social: sum("social"), penalty: sum("penalty"), adjustment: sum("adjustment"), interest: sum("interest"), spending: sum("spending") } }) };
    }
    case "monthly-collections": {
      const year = options.years.includes(input.year) ? input.year : options.years[0] ?? "";
      const list = await monthlyCollections(year);
      const rows = list.map(m => ({ month: m.period, savings: m.savings, shares: m.savings / SHARE_VALUE, social: m.social, penalty: m.penalty, total: m.savings + m.social + m.penalty, savers: m.savers }));
      const sum = (k: "savings" | "shares" | "social" | "penalty" | "total") => rows.reduce((s, r) => s + r[k], 0);
      return { params: { year }, table: base(title, year, [
        { key: "month", label: L("Month", "Ukwezi"), type: "month", width: 110 }, { key: "savings", label: L("Savings", "Ubwizigame"), type: "money" },
        { key: "shares", label: L("Shares", "Imigabane"), type: "shares", width: 90 }, { key: "social", label: L("Social fund", "Ingoboka"), type: "money" },
        { key: "penalty", label: L("Penalties", "Amande"), type: "money" }, { key: "total", label: L("Total received", "Byose"), type: "money" },
        { key: "savers", label: L("Members who saved", "Abizigamye"), type: "number", width: 130 },
      ], rows, rows.length, { totals: { month: L("Total", "Igiteranyo"), savings: sum("savings"), shares: sum("shares"), social: sum("social"), penalty: sum("penalty"), total: sum("total"), savers: null } }) };
    }
    case "member-balances": {
      const where = sql`(m.status = 'active' or exists (select 1 from ledger_entries l where l.member_id = m.id and l.voided_at is null and l.kind in ('savings', 'adjustment', 'interest')))`;
      const [result, [totals]] = await Promise.all([
        queryMembers(where, page, pageSize),
        db.execute(sql`select coalesce(sum(amount) filter (where kind in ('savings', 'adjustment')), 0)::float8 as principal,
          coalesce(sum(amount) filter (where kind = 'interest'), 0)::float8 as interest from ledger_entries where voided_at is null`) as unknown as Promise<{ principal: number; interest: number }[]>,
      ]);
      const rows = result.rows.map(m => ({ code: m.id, name: m.sheetName, status: m.status === "active" ? L("Current", "Ari mu kimina") : L("Former", "Yavuyemo"), principal: principalOf(m), shares: principalOf(m) / SHARE_VALUE, interest: m.interest, total: principalOf(m) + m.interest }));
      const p = Number(totals.principal), i = Number(totals.interest);
      return { params: {}, table: base(title, L(`As of ${kigaliToday()}`, `Kugeza ${kigaliToday()}`), [
        { key: "code", label: L("Member ID", "Inomero"), type: "text", width: 100 }, { key: "name", label: L("Name", "Izina"), type: "text", width: 220 },
        { key: "status", label: L("Status", "Uko ahagaze"), type: "text", width: 90 }, { key: "principal", label: L("Savings principal", "Ubwizigame shingiro"), type: "money", width: 140 },
        { key: "shares", label: L("Shares", "Imigabane"), type: "shares", width: 90 }, { key: "interest", label: L("Interest allocated", "Inyungu zagenewe"), type: "money", width: 140 },
        { key: "total", label: L("Total with interest", "Byose hamwe n’inyungu"), type: "money", width: 150 },
      ], rows, result.total, { frozen: 2, totals: { code: L("Total", "Igiteranyo"), principal: p, shares: p / SHARE_VALUE, interest: i, total: p + i } }) };
    }
    case "member-statement": {
      const code = input.member || (await searchMembers("", 1))[0]?.id || "";
      const member = code ? await loadMember(code) : null;
      if (!member) return { params: { member: code }, table: base(title, L("Choose a member", "Hitamo umunyamuryango"), [], [], 0) };
      const [{ id: memberId }] = await db.execute(sql`select id from members where code = ${code}`) as unknown as { id: string }[];
      const records = (await memberRecordsFor(memberId)).toSorted(chronological);
      const years = [...new Set(records.map(r => r.period.slice(0, 4)).filter(Boolean))].sort().reverse();
      const period = input.period === "all" || years.includes(input.period) ? input.period : "all";
      let balance = 0, opening = 0;
      const rows: Record<string, ReportCell>[] = [];
      for (const r of records) {
        const inScope = period === "all" || r.period.startsWith(period);
        if (!inScope) { if (affectsSavings(r) && r.period && r.period < period) { balance += r.amount; opening = balance; } continue; }
        if (affectsSavings(r)) balance += r.amount;
        const type = { savings: L("Savings", "Ubwizigame"), social: L("Social fund", "Ingoboka"), penalty: L("Penalty", "Amande"), interest: L("Interest", "Inyungu"), adjustment: L("Withdrawal / deduction", "Ayakuweho") }[r.type];
        rows.push({ month: r.period || null, date: r.date || null, reference: r.id, type, amount: r.amount, shares: r.type === "savings" ? r.amount / SHARE_VALUE : null, balance: affectsSavings(r) ? balance : null, method: r.method || null, source: r.sourceRef ?? null });
      }
      const sum = (kind: string) => records.filter(r => r.type === kind && (period === "all" || r.period.startsWith(period))).reduce((s, r) => s + r.amount, 0);
      return { params: { member: code, period }, table: base(`${title} · ${member.sheetName}`, `${member.id} · ${scopeLabel(period)}`, [
        { key: "month", label: L("Month", "Ukwezi"), type: "month", width: 100 }, { key: "date", label: L("Payment date", "Itariki"), type: "date", width: 110 },
        { key: "reference", label: L("Reference", "Inomero"), type: "text", width: 150 }, { key: "type", label: L("Type", "Ubwoko"), type: "text", width: 150 },
        { key: "amount", label: L("Amount", "Amafaranga"), type: "money", width: 110 }, { key: "shares", label: L("Shares", "Imigabane"), type: "shares", width: 80 },
        { key: "balance", label: L("Savings balance", "Ubwizigame"), type: "money", width: 130 }, { key: "method", label: L("Method", "Uburyo"), type: "text", width: 120 },
        { key: "source", label: L("Source", "Aho byavuye"), type: "text", width: 130 },
      ], slice(rows, page, pageSize), rows.length, {
        summary: [
          { label: L("Opening savings", "Ubwizigame butangira"), value: period === "all" ? 0 : opening, type: "money" },
          { label: L("Savings contributed", "Imisanzu y’ubwizigame"), value: sum("savings"), type: "money" },
          { label: L("Withdrawals", "Ayakuweho"), value: sum("adjustment"), type: "money" },
          { label: L("Closing savings", "Ubwizigame busoza"), value: balance, type: "money" },
          { label: L("Social fund", "Ingoboka"), value: sum("social"), type: "money" },
          { label: L("Penalties", "Amande"), value: sum("penalty"), type: "money" },
          { label: L("Interest allocated", "Inyungu zagenewe"), value: sum("interest"), type: "money" },
        ],
      }) };
    }
    case "interest-allocation": {
      const year = options.interestYears.includes(input.year) ? input.year : options.interestYears[0] ?? "";
      const data = await loadReports("interest", "all", year, page, pageSize);
      const interest = data.interest!;
      return { params: { year }, table: base(title, year, [
        { key: "code", label: L("Member ID", "Inomero"), type: "text", width: 100 }, { key: "name", label: L("Name", "Izina"), type: "text", width: 240 },
        { key: "amount", label: L("Interest allocated (RWF)", "Inyungu zagenewe (RWF)"), type: "money", width: 180 },
      ], interest.page.rows.map(r => ({ code: r.member.id, name: r.member.sheetName, amount: r.amount })), interest.page.total, {
        frozen: 2, totals: { code: L("Total", "Igiteranyo"), amount: interest.total },
        notes: [L("Allocations do not show whether interest was paid out or added to savings.", "Inyungu zagenewe ntizigaragaza niba zarishyuwe cyangwa zongewe ku bwizigame.")],
      }) };
    }
    case "member-register": {
      const filter: MemberFilter = pick(input.filter, MEMBER_FILTERS, "all");
      const data = await loadMembersPage(filter, input.q ?? "", page, pageSize);
      const account = { active: L("Can sign in", "Ashobora kwinjira"), invited: L("Link sent", "Ihuza ryoherejwe"), blocked: L("Blocked", "Yahagaritswe"), none: L("No account", "Nta konti") };
      return { params: { filter, q: data.q }, table: base(title, { all: L("Current members", "Abanyamuryango"), missing: L("Missing email", "Imeyili ibura"), "no-account": L("Can’t sign in yet", "Batarinjira"), former: L("Former members", "Abahoze") }[filter], [
        { key: "code", label: L("Member ID", "Inomero"), type: "text", width: 100 }, { key: "name", label: L("Name", "Izina"), type: "text", width: 220 },
        { key: "district", label: L("District", "Akarere"), type: "text", width: 120 }, { key: "email", label: L("Email", "Imeyili"), type: "text", width: 240 },
        { key: "phone", label: L("Phone", "Telefoni"), type: "text", width: 150 }, { key: "monthly", label: L("Monthly savings", "Ubwizigame bwa buri kwezi"), type: "money", width: 140 },
        { key: "account", label: L("Account", "Konti"), type: "text", width: 120 },
      ], data.page.rows.map(m => ({ code: m.id, name: m.sheetName, district: m.district || null, email: m.email || null, phone: m.phone || null, monthly: m.monthlySavings || null, account: account[m.account] })), data.page.total, { frozen: 2 }) };
    }
    case "register-sheet": {
      const kind = pick(input.kind, KINDS, "savings");
      const data = await loadRegister(kind, { tab: "sheet", period: "all", q: input.q ?? "", page, year: input.year || "all", pageSize });
      const sheet = data.sheet!;
      const years = [...new Set(sheet.months.map(m => m.slice(0, 4)))];
      const columns: ReportColumn[] = [{ key: "code", label: L("Member ID", "Inomero"), type: "text", width: 100 }, { key: "name", label: L("Name", "Izina"), type: "text", width: 210 }];
      for (const y of years) {
        for (const m of sheet.months.filter(p => p.startsWith(y))) columns.push({ key: m, label: monthName(m, lang), type: "money", width: 86 });
        columns.push({ key: `total-${y}`, label: `${L("Total", "Igiteranyo")} ${y}`, type: "money", width: 104 });
      }
      columns.push({ key: "total", label: L("Total", "Igiteranyo"), type: "money", width: 112 });
      const line = (cells: Record<string, number>, total: number) => {
        const out: Record<string, ReportCell> = {};
        for (const y of years) {
          let yearTotal = 0;
          for (const m of sheet.months.filter(p => p.startsWith(y))) { out[m] = cells[m] || null; yearTotal += cells[m] ?? 0; }
          out[`total-${y}`] = yearTotal || null;
        }
        out.total = total;
        return out;
      };
      const rows = sheet.page.rows.map(r => ({ code: r.member.id, name: r.member.name, ...line(Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.amount])), r.total) }));
      return { params: { kind, year: sheet.year, q: data.q }, table: base(`${title} · ${kindLabel(kind)}`, scopeLabel(sheet.year), columns, rows, sheet.page.total, { frozen: 2, totals: { code: L("Total", "Igiteranyo"), ...line(sheet.columnTotals, sheet.grandTotal) } }) };
    }
    case "register-summary":
    case "register-payments": {
      const kind = pick(input.kind, KINDS, "savings");
      const month = input.month === "all" || options.months[kind]?.includes(input.month) ? input.month : kind === "penalty" ? "all" : options.months[kind]?.[0] ?? "all";
      const payments = id === "register-payments";
      const data = await loadRegister(kind, { tab: payments ? "payments" : "members", period: month, q: input.q ?? "", page, year: "all", pageSize });
      const subtitle = `${kindLabel(kind)} · ${month === "all" ? L("All months", "Amezi yose") : monthName(month, lang)}`;
      if (payments) {
        const list = data.payments!;
        return { params: { kind, month: data.period, q: data.q }, table: base(`${title}`, subtitle, [
          { key: "reference", label: L("Reference", "Inomero"), type: "text", width: 150 }, { key: "code", label: L("Member ID", "Inomero y’umunyamuryango"), type: "text", width: 100 },
          { key: "name", label: L("Name", "Izina"), type: "text", width: 200 }, { key: "month", label: L("Month", "Ukwezi"), type: "month", width: 100 },
          { key: "date", label: L("Payment date", "Itariki"), type: "date", width: 110 }, { key: "amount", label: L("Amount", "Amafaranga"), type: "money", width: 110 },
          ...(kind === "savings" ? [{ key: "shares", label: L("Shares", "Imigabane"), type: "shares" as const, width: 80 }] : []),
          { key: "method", label: L("Method", "Uburyo"), type: "text", width: 120 }, { key: "source", label: L("Source", "Aho byavuye"), type: "text", width: 130 },
        ], list.rows.map(r => ({ reference: r.id, code: r.memberId, name: r.memberSheetName ?? r.memberName ?? "", month: r.period || null, date: r.date || null, amount: r.amount, shares: r.amount / SHARE_VALUE, method: r.method || null, source: r.sourceRef ?? L("Recorded in the app", "Byanditswe hano") })),
        list.total, { frozen: 1, totals: { reference: L("Total", "Igiteranyo"), amount: data.stats.total, shares: data.stats.total / SHARE_VALUE } }) };
      }
      const list = data.summary!;
      return { params: { kind, month: data.period, q: data.q }, table: base(title, subtitle, [
        { key: "code", label: L("Member ID", "Inomero"), type: "text", width: 100 }, { key: "name", label: L("Name", "Izina"), type: "text", width: 220 },
        { key: "payments", label: L("Payments", "Ubwishyu"), type: "number", width: 90 }, { key: "paid", label: L("Recorded value", "Amafaranga yanditswe"), type: "money", width: 150 },
        ...(kind === "savings" ? [{ key: "shares", label: L("Shares", "Imigabane"), type: "shares" as const, width: 90 }, { key: "commitment", label: L("Monthly commitment", "Umusanzu usabwa"), type: "money" as const, width: 150 }] : []),
      ], list.rows.map(r => ({ code: r.member.id, name: r.member.sheetName, payments: r.count, paid: r.paid, shares: r.paid / SHARE_VALUE, commitment: r.member.monthlySavings || null })),
      list.total, { frozen: 2, totals: { code: L("Total", "Igiteranyo"), payments: data.stats.count, paid: data.stats.total, shares: data.stats.total / SHARE_VALUE } }) };
    }
    case "cashbook": {
      const flow: CashFlow = pick(input.flow, CASH_FLOWS, "all");
      const data = await loadCashbook(input.year || "all", flow, page, pageSize, "asc");
      const s = data.summary;
      return { params: { year: data.year, flow }, table: base(title, data.year === "all" ? L("All years", "Imyaka yose") : data.year, [
        { key: "position", label: "#", type: "number", width: 60 }, { key: "date", label: L("Date", "Itariki"), type: "date", width: 110 },
        { key: "written", label: L("Date as written", "Itariki uko yanditswe"), type: "text", width: 110 }, { key: "description", label: L("Description", "Ibisobanuro"), type: "text", width: 280 },
        { key: "category", label: L("Category", "Icyiciro"), type: "text", width: 130 }, { key: "in", label: L("Money in", "Ayinjiye"), type: "money", width: 110 },
        { key: "out", label: L("Money out", "Ayasohotse"), type: "money", width: 110 }, { key: "balance", label: L("Balance", "Asigaye"), type: "money", width: 110 },
        { key: "workbook", label: L("Workbook balance", "Asigaye mu mbonerahamwe"), type: "money", width: 140 }, { key: "comment", label: L("Comment", "Igitekerezo"), type: "text", width: 260 },
      ], data.page.rows.map(e => ({ position: e.position, date: e.date || null, written: e.dateText || null, description: e.description, category: e.category || null, in: e.moneyIn || null, out: e.moneyOut || null, balance: e.balance, workbook: e.sourceBalance, comment: e.comment || null })),
      data.page.total, {
        frozen: 2, totals: { position: null, description: L("Total", "Igiteranyo"), in: s.moneyIn, out: s.moneyOut, balance: s.closing },
        summary: [{ label: L("Opening balance", "Ayatangiye"), value: s.opening, type: "money" }, { label: L("Money in", "Ayinjiye"), value: s.moneyIn, type: "money" }, { label: L("Money out", "Ayasohotse"), value: s.moneyOut, type: "money" }, { label: L("Closing balance", "Asigaye"), value: s.closing, type: "money" }],
      }) };
    }
    case "cashbook-categories": {
      const year = input.year === "all" || options.cashYears.includes(input.year) ? input.year : "all";
      const list = await cashByCategory(year);
      const rows = list.map(c => ({ category: c.category || L("Uncategorized", "Nta cyiciro"), entries: c.entries, in: c.moneyIn || null, out: c.moneyOut || null }));
      return { params: { year }, table: base(title, year === "all" ? L("All years", "Imyaka yose") : year, [
        { key: "category", label: L("Category", "Icyiciro"), type: "text", width: 200 }, { key: "entries", label: L("Entries", "Inyandiko"), type: "number", width: 90 },
        { key: "in", label: L("Money in", "Ayinjiye"), type: "money", width: 130 }, { key: "out", label: L("Money out", "Ayasohotse"), type: "money", width: 130 },
      ], rows, rows.length, { totals: { category: L("Total", "Igiteranyo"), entries: list.reduce((s, c) => s + c.entries, 0), in: list.reduce((s, c) => s + c.moneyIn, 0), out: list.reduce((s, c) => s + c.moneyOut, 0) },
        notes: [L("Categorise entries on the Cashbook page to group them here.", "Shyira ibyanditswe mu byiciro ku rupapuro rw’igitabo cy’imari.")] }) };
    }
    case "import-review": {
      const run = await latestImportSummary();
      const findings = run?.summary.findings ?? [];
      const rows = findings.map((f, i) => ({ no: i + 1, sheet: f.sheet, cell: f.ref ?? null, finding: f.message }));
      return { params: {}, table: base(title, run ? L(`Imported ${kigaliToday(run.createdAt)}`, `Byinjijwe ${kigaliToday(run.createdAt)}`) : L("No import yet", "Nta byinjijwe"), [
        { key: "no", label: "#", type: "number", width: 50 }, { key: "sheet", label: L("Sheet", "Urupapuro"), type: "text", width: 140 },
        { key: "cell", label: L("Cell", "Akazu"), type: "text", width: 150 }, { key: "finding", label: L("Finding", "Icyabonetse"), type: "text", width: 640 },
      ], slice(rows, page, pageSize), rows.length, { summary: Object.entries(run?.summary.counts ?? {}).map(([label, value]) => ({ label: label.replace(/([A-Z])/g, " $1").toLowerCase(), value, type: "number" as const })) }) };
    }
  }
  return null;
}

export async function getReportOptions(): Promise<ReportOptions> {
  return reportOptions();
}

// ---------------------------------------------------------------- downloads

const csvCell = (value: ReportCell) => {
  const text = value == null ? "" : typeof value === "string" && /^[=+@-]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export function reportCsv(table: ReportTable) {
  const lines: ReportCell[][] = [[table.title], [table.subtitle], []];
  for (const s of table.summary ?? []) lines.push([s.label, s.value]);
  if (table.summary?.length) lines.push([]);
  lines.push(table.columns.map(c => c.label));
  for (const row of table.rows.slice(0, MAX_ROWS)) lines.push(table.columns.map(c => row[c.key] ?? null));
  if (table.totals) lines.push(table.columns.map(c => table.totals![c.key] ?? null));
  for (const note of table.notes ?? []) lines.push([note]);
  return "﻿" + lines.map(line => line.map(csvCell).join(",")).join("\r\n");
}

const NUM_FORMATS: Record<string, string> = { money: "#,##0;-#,##0", number: "#,##0", shares: "#,##0.##", date: "dd mmm yyyy", month: "mmm yyyy" };

/** Formatted Excel workbook: title block, frozen bold header, number formats, filters and a totals row. */
export async function reportXlsx(table: ReportTable) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Elayo Family";
  wb.created = new Date();
  const ws = wb.addWorksheet(table.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report");
  ws.addRow([table.title]).font = { bold: true, size: 14, color: { argb: "FF0057D9" } };
  ws.addRow([table.subtitle]).font = { color: { argb: "FF6B7785" } };
  ws.addRow([`Generated ${kigaliToday()}`]).font = { italic: true, size: 9, color: { argb: "FF8A97A5" } };
  for (const s of table.summary ?? []) {
    const row = ws.addRow([s.label, s.value]);
    row.getCell(2).numFmt = NUM_FORMATS[s.type];
    row.getCell(1).font = { bold: true };
  }
  ws.addRow([]);
  const header = ws.addRow(table.columns.map(c => c.label));
  const headerRow = header.number;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FF1F2933" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF3" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF9AA5B1" } } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  const toValue = (type: string, value: ReportCell) => {
    if (value == null || value === "") return null;
    if (type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
    if (type === "month" && typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return new Date(`${value}-01T00:00:00Z`);
    return value;
  };
  for (const row of table.rows.slice(0, MAX_ROWS)) {
    const added = ws.addRow(table.columns.map(c => toValue(c.type, row[c.key] ?? null)));
    table.columns.forEach((c, i) => { if (NUM_FORMATS[c.type]) added.getCell(i + 1).numFmt = NUM_FORMATS[c.type]; });
  }
  if (table.totals) {
    const added = ws.addRow(table.columns.map(c => table.totals![c.key] ?? null));
    added.eachCell((cell, i) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "thin", color: { argb: "FF1F2933" } }, bottom: { style: "double", color: { argb: "FF1F2933" } } };
      const type = table.columns[i - 1]?.type;
      if (type && NUM_FORMATS[type] && type !== "date" && type !== "month") cell.numFmt = NUM_FORMATS[type];
    });
  }
  for (const note of table.notes ?? []) ws.addRow([note]).font = { italic: true, color: { argb: "FF6B7785" } };
  table.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(8, Math.round((c.width ?? (c.type === "text" ? 160 : 110)) / 7)); });
  ws.views = [{ state: "frozen", xSplit: table.frozen ?? 0, ySplit: headerRow }];
  if (table.columns.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: table.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
