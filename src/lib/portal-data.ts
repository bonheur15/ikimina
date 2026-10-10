// Fictional preview records. Source workbooks and real member information are not imported.
export type ContributionKind = "savings" | "social" | "penalty";
export type Member = {
  id: string; name: string; initials: string; district: string; email: string; phone: string;
  monthlySavings: number; openingSavings: number; interest: number; color: string;
};
export type MemberRecord = {
  id: string; memberId: string; type: ContributionKind; amount: number; date: string;
  time: string; period: string; method: string; note: string; shares?: number;
};
export const SHARE_VALUE = 5000;
const profiles = [
  ["Aline Mutesi", "AM", "Gasabo", 1240000, 50000, 96400, "mint"],
  ["Eric Mugisha", "EM", "Kicukiro", 980000, 40000, 76200, "blue"],
  ["Grace Umutoni", "GU", "Nyarugenge", 1560000, 75000, 121600, "violet"],
  ["Patrick Niyonzima", "PN", "Gasabo", 745000, 25000, 57900, "peach"],
  ["Diane Mukamana", "DM", "Kicukiro", 1120000, 50000, 87100, "mint"],
  ["Jean Habimana", "JH", "Musanze", 860000, 35000, 66900, "blue"],
  ["Olive Ingabire", "OI", "Huye", 635000, 25000, 49400, "violet"],
  ["David Bizimana", "DB", "Gasabo", 1325000, 60000, 103000, "peach"],
] as const;
export const members: Member[] = profiles.map((p, i) => ({
  id: `IK${String(i + 1).padStart(3, "0")}`, name: p[0], initials: p[1], district: p[2],
  email: i === 3 || i === 6 ? "" : `${p[0].split(" ")[0].toLowerCase()}@example.com`, phone: "+250 700 000 000",
  monthlySavings: p[4], openingSavings: p[3] - p[4] * (i === 3 || i === 6 ? 9 : 10), interest: p[5], color: p[6],
}));
export const initialRecords: MemberRecord[] = members.flatMap<MemberRecord>((member, index) =>
  Array.from({ length: index === 3 || index === 6 ? 9 : 10 }, (_, month) => {
    const period = `2026-${String(month + 1).padStart(2, "0")}`;
    const date = `${period}-${String(3 + index % 4).padStart(2, "0")}`;
    return [
      { id: `RC-${member.id}-${month + 1}-S`, memberId: member.id, type: "savings" as const,
        amount: member.monthlySavings, shares: member.monthlySavings / SHARE_VALUE, date, time: "09:42", period,
        method: index % 2 ? "Bank transfer" : "Mobile Money", note: "Monthly savings contribution" },
      { id: `RC-${member.id}-${month + 1}-F`, memberId: member.id, type: "social" as const,
        amount: 5000, date, time: "09:44", period,
        method: index % 2 ? "Bank transfer" : "Mobile Money", note: "Monthly social contribution" },
    ];
  }).flat()
).concat([
  { id: "RC-IK001-08-P", memberId: "IK001", type: "penalty", amount: 2000,
    date: "2026-08-05", time: "10:15", period: "2026-08", method: "Mobile Money", note: "Late meeting penalty settled" },
  { id: "RC-IK006-09-P", memberId: "IK006", type: "penalty", amount: 2000,
    date: "2026-09-05", time: "11:20", period: "2026-09", method: "Cash", note: "Late contribution penalty settled" },
]).sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`) || b.id.localeCompare(a.id));
export const expenses = [
  { id: "EX-001", date: "2026-10-02", name: "Bank charges", category: "Administration", amount: 15000 },
  { id: "EX-002", date: "2026-09-25", name: "Medical support", category: "Social support", amount: 150000 },
  { id: "EX-003", date: "2026-09-18", name: "Meeting expenses", category: "Administration", amount: 25000 },
  { id: "EX-004", date: "2026-08-20", name: "Family support", category: "Social support", amount: 100000 },
];
export const CURRENT_PERIOD = "2026-10";
export const money = (amount: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
export const sumRecords = (records: MemberRecord[], kind?: ContributionKind) =>
  records.filter(r => !kind || r.type === kind).reduce((sum, r) => sum + r.amount, 0);
export const memberRecords = (records: MemberRecord[], id: string) => records.filter(r => r.memberId === id);
export const recordShares = (record: MemberRecord) => record.type === "savings" ? record.shares ?? record.amount / SHARE_VALUE : 0;
export const savingsBalance = (member: Member, records: MemberRecord[]) =>
  member.openingSavings + sumRecords(memberRecords(records, member.id), "savings");
export function runningBalance(member: Member, records: MemberRecord[], record: MemberRecord) {
  const chronological = memberRecords(records, member.id).toSorted((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`) || a.id.localeCompare(b.id));
  let balance = member.openingSavings;
  for (const item of chronological) {
    if (item.type === "savings") balance += item.amount;
    if (item.id === record.id) return balance;
  }
  return balance;
}
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(cell => {
    const value = typeof cell === "string" && /^[=+@-]/.test(cell) ? `'${cell}` : String(cell);
    return `"${value.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportRecords(records: MemberRecord[], filename: string) {
  downloadCsv(filename, [
    ["Sample records — Ikimina preview"],
    ["Reference", "Member code", "Type", "Shares", "Amount (RWF)", "Payment date", "Time (Kigali)", "Contribution month", "Method", "Note"],
    ...records.map(r => [r.id, r.memberId, r.type, r.type === "savings" ? recordShares(r) : "", r.amount, r.date, r.time, r.period, r.method, r.note]),
  ]);
}
