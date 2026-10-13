// Data shapes for the paginated administrator views. Shared by server queries and client components.
import type { CashEntry, ContributionKind, Member, MemberRecord } from "./portal-data";

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };
/** Net savings movement per contribution month; period "" holds undated adjustments. */
export type MonthlyAmount = { period: string; amount: number };

export type OverviewData = {
  activeCount: number;
  principal: number;
  latestPeriod: string;
  latestSavings: number;
  participation: { expected: number; met: number };
  socialTotal: number;
  supportTotal: number;
  interestYear: string;
  interestTotal: number;
  accountsReady: number;
  missingEmail: number;
  recent: MemberRecord[];
  series: MonthlyAmount[];
};

export const MEMBER_FILTERS = ["all", "missing", "no-account", "former"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];
export type MembersData = { filter: MemberFilter; q: string; counts: Record<MemberFilter, number>; page: Page<Member> };

export const REGISTER_TABS = ["payments", "members", "sheet"] as const;
export type RegisterTab = (typeof REGISTER_TABS)[number];
export type SheetCellData = { amount: number; count: number; ref: string };
export type SheetRow = {
  member: Pick<Member, "id" | "name" | "status">;
  cells: Record<string, SheetCellData>;
  total: number;
};
export type SheetData = {
  year: string;
  years: string[];
  months: string[];
  page: Page<SheetRow>;
  columnTotals: Record<string, number>;
  grandTotal: number;
};
export type RegisterData = {
  kind: ContributionKind;
  tab: RegisterTab;
  period: string;
  q: string;
  months: string[];
  stats: { total: number; count: number; contributors: number };
  kindTotal: number;
  supportTotal: number;
  support: CashEntry[];
  payments?: Page<MemberRecord>;
  summary?: Page<{ member: Member; paid: number; count: number }>;
  sheet?: SheetData;
};

export const CASH_FLOWS = ["all", "in", "out"] as const;
export type CashFlow = (typeof CASH_FLOWS)[number];
export type CashbookData = {
  year: string;
  flow: CashFlow;
  years: string[];
  /** "entries": newest first; "sheet": book order like the workbook. */
  view: "entries" | "sheet";
  summary: { opening: number; moneyIn: number; moneyOut: number; closing: number; entries: number };
  page: Page<CashEntry>;
};

export const REPORTS = ["financial", "members", "interest"] as const;
export type ReportKind = (typeof REPORTS)[number];
export type YearTotals = {
  year: string;
  savings: number;
  social: number;
  penalty: number;
  interest: number;
  adjustment: number;
};
export type ReportsData = {
  report: ReportKind;
  period: string;
  years: string[];
  byYear: YearTotals[];
  financial: YearTotals & { spending: number };
  balances?: { page: Page<Member>; totalPrincipal: number };
  interest?: { year: string; years: string[]; page: Page<{ member: Member; amount: number }>; total: number };
};
