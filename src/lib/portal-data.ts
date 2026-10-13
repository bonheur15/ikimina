// Shapes shared by the server loaders and the portal UI, plus pure helpers.
export type ContributionKind = "savings" | "social" | "penalty";
/** `adjustment` covers withdrawals and corrections to savings (signed). */
export type RecordKind = ContributionKind | "interest" | "adjustment";
export type AccountState = "none" | "invited" | "active" | "blocked";

export type MemberTotals = Record<RecordKind, number>;
export type Member = {
  /** Member code, e.g. CEAD0001. */
  id: string;
  name: string;
  /** Surname first, as in the Excel registers (used in sheets and reports). */
  sheetName: string;
  initials: string;
  district: string;
  email: string;
  phone: string;
  status: "active" | "former";
  /** Expected monthly savings in RWF; 0 when not set. */
  monthlySavings: number;
  /** Interest allocated across all years. */
  interest: number;
  totals: MemberTotals;
  account: AccountState;
  color: string;
};
export type MemberRecord = {
  /** Reference, e.g. IMP-SAV-G4 or SAV-2610-7K3QX. */
  id: string;
  memberId: string;
  /** Included when records from several members are listed together. */
  memberName?: string;
  /** Surname first, as in the Excel registers. */
  memberSheetName?: string;
  type: RecordKind;
  amount: number;
  /** Payment date (YYYY-MM-DD, Kigali); empty when only the month is known. */
  date: string;
  /** Payment time (HH:MM, Kigali); empty when unknown. */
  time: string;
  /** Month the record applies to (YYYY-MM); empty when the source does not say. */
  period: string;
  method: string;
  note: string;
  source: "import" | "manual";
  sourceRef?: string;
};
export type CashEntry = {
  id: string;
  position: number;
  date: string;
  dateText: string;
  dateInferred: boolean;
  description: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
  sourceBalance: number | null;
  category: string;
  comment: string;
  source: "import" | "manual";
};

export const SHARE_VALUE = 5000;
/** Default monthly social fund contribution (RWF); the group can change it in settings. */
export const SOCIAL_MONTHLY = 2000;
export const SOCIAL_SUPPORT = "Social support";
export const CASH_CATEGORIES = [
  "Administration",
  "Communication",
  "Transport",
  "Meetings",
  SOCIAL_SUPPORT,
  "Bank charges",
  "Equipment",
  "Petty cash top-up",
  "Other",
];

const kigaliParts = (date = new Date()) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Kigali",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
/** Today's date in Kigali as YYYY-MM-DD. */
export const kigaliToday = (date = new Date()) => {
  const p = kigaliParts(date);
  return `${p.year}-${p.month}-${p.day}`;
};
export const kigaliTime = (date = new Date()) => {
  const p = kigaliParts(date);
  return `${p.hour}:${p.minute}`;
};
export const currentPeriod = () => kigaliToday().slice(0, 7);

export const money = (amount: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
export const sumRecords = (records: MemberRecord[], kind?: RecordKind) =>
  records.reduce((sum, r) => (!kind || r.type === kind ? sum + r.amount : sum), 0);
export const memberRecords = (records: MemberRecord[], id: string) => records.filter((r) => r.memberId === id);
export const recordShares = (record: MemberRecord) => (record.type === "savings" ? record.amount / SHARE_VALUE : 0);
/** Savings principal: contributions plus withdrawals and corrections. Interest is reported separately. */
export const affectsSavings = (record: MemberRecord) => record.type === "savings" || record.type === "adjustment";
export const savingsBalance = (records: MemberRecord[]) =>
  records.reduce((sum, r) => (affectsSavings(r) ? sum + r.amount : sum), 0);
export const principalOf = (member: Member) => member.totals.savings + member.totals.adjustment;

/** Oldest first. Records without a period (undated adjustments) come last, matching the workbook's "total up to now". */
export const chronological = (a: MemberRecord, b: MemberRecord) =>
  (a.period || "9999").localeCompare(b.period || "9999") ||
  `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`) ||
  a.id.localeCompare(b.id);

/** Net savings movement per contribution month; period "" holds undated adjustments. */
export function monthlyNet(records: MemberRecord[]) {
  const byPeriod = new Map<string, number>();
  for (const r of records) if (affectsSavings(r)) byPeriod.set(r.period, (byPeriod.get(r.period) ?? 0) + r.amount);
  return [...byPeriod].map(([period, amount]) => ({ period, amount })).sort((a, b) => a.period.localeCompare(b.period));
}

/** Savings balance at the end of each month in `periods` (YYYY-MM). Undated adjustments count from the last month. */
export function balanceSeries(series: { period: string; amount: number }[], periods: string[]) {
  const dated = series.filter((s) => s.period).sort((a, b) => a.period.localeCompare(b.period));
  const undated = series.filter((s) => !s.period).reduce((sum, s) => sum + s.amount, 0);
  let i = 0,
    balance = 0;
  return periods.map((period, index) => {
    while (i < dated.length && dated[i].period <= period) balance += dated[i++].amount;
    return balance + (index === periods.length - 1 ? undated : 0);
  });
}

export function monthsBack(count: number, end = currentPeriod()) {
  const [y, m] = end.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = typeof cell === "string" && /^[=+@-]/.test(cell) ? `'${cell}` : String(cell);
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRecords(records: MemberRecord[], filename: string, title = "Elayo Family records") {
  downloadCsv(filename, [
    [title],
    [
      "Reference",
      "Member code",
      "Type",
      "Shares",
      "Amount (RWF)",
      "Contribution month",
      "Payment date",
      "Time (Kigali)",
      "Method",
      "Note",
      "Source",
    ],
    ...records.map((r) => [
      r.id,
      r.memberId,
      r.type,
      r.type === "savings" ? recordShares(r) : "",
      r.amount,
      r.period,
      r.date,
      r.time,
      r.method,
      r.note,
      r.sourceRef ?? "",
    ]),
  ]);
}
