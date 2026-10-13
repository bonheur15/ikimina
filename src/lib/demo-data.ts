// Fictional display data. The source workbooks are not imported or modified.
export const members = [
  {
    id: "IK001",
    name: "Aline Mutesi",
    initials: "AM",
    district: "Gasabo",
    savings: 1240000,
    shares: 248,
    email: true,
    status: "active",
    color: "sage",
  },
  {
    id: "IK002",
    name: "Eric Mugisha",
    initials: "EM",
    district: "Kicukiro",
    savings: 980000,
    shares: 196,
    email: true,
    status: "active",
    color: "sand",
  },
  {
    id: "IK003",
    name: "Grace Umutoni",
    initials: "GU",
    district: "Nyarugenge",
    savings: 1560000,
    shares: 312,
    email: true,
    status: "active",
    color: "lavender",
  },
  {
    id: "IK004",
    name: "Patrick Niyonzima",
    initials: "PN",
    district: "Gasabo",
    savings: 745000,
    shares: 149,
    email: false,
    status: "pending",
    color: "peach",
  },
  {
    id: "IK005",
    name: "Diane Mukamana",
    initials: "DM",
    district: "Kicukiro",
    savings: 1120000,
    shares: 224,
    email: true,
    status: "active",
    color: "sage",
  },
  {
    id: "IK006",
    name: "Jean Habimana",
    initials: "JH",
    district: "Musanze",
    savings: 860000,
    shares: 172,
    email: true,
    status: "active",
    color: "sand",
  },
  {
    id: "IK007",
    name: "Olive Ingabire",
    initials: "OI",
    district: "Huye",
    savings: 635000,
    shares: 127,
    email: false,
    status: "pending",
    color: "lavender",
  },
  {
    id: "IK008",
    name: "David Bizimana",
    initials: "DB",
    district: "Gasabo",
    savings: 1325000,
    shares: 265,
    email: true,
    status: "active",
    color: "peach",
  },
];
export const transactions = [
  {
    id: "TX-0248",
    member: 0,
    type: "savings",
    amount: 50000,
    date: "2026-10-06",
    time: "09:42",
    method: "Mobile Money",
  },
  {
    id: "TX-0247",
    member: 1,
    type: "social",
    amount: 5000,
    date: "2026-10-06",
    time: "09:18",
    method: "Bank transfer",
  },
  {
    id: "TX-0246",
    member: 2,
    type: "savings",
    amount: 100000,
    date: "2026-10-06",
    time: "08:56",
    method: "Bank transfer",
  },
  {
    id: "TX-0245",
    member: 4,
    type: "savings",
    amount: 25000,
    date: "2026-10-05",
    time: "16:30",
    method: "Mobile Money",
  },
  { id: "TX-0244", member: 5, type: "penalty", amount: 2000, date: "2026-10-05", time: "14:12", method: "Cash" },
  { id: "TX-0243", member: 7, type: "social", amount: 5000, date: "2026-10-05", time: "11:06", method: "Mobile Money" },
];
export const money = (amount: number) => new Intl.NumberFormat("en-US").format(amount);

export type Member = (typeof members)[number];
export type ContributionKind = "savings" | "social" | "penalty";
export type MemberRecord = {
  id: string;
  memberId: string;
  type: ContributionKind;
  amount: number;
  date: string;
  time: string;
  method: string;
  balance: number;
  note: "monthly" | "extra" | "social" | "penalty";
};

// Consistent, fictional history for every sample member. Dates and times are Kigali local time.
export function getMemberRecords(member: Member): MemberRecord[] {
  const index = members.findIndex((m) => m.id === member.id);
  const monthly = 25000 + index * 5000;
  const base = [
    {
      date: "2026-07-04",
      time: "10:24",
      type: "savings" as const,
      amount: monthly,
      method: "Mobile Money",
      note: "monthly" as const,
    },
    {
      date: "2026-07-04",
      time: "10:26",
      type: "social" as const,
      amount: 5000,
      method: "Mobile Money",
      note: "social" as const,
    },
    {
      date: "2026-08-05",
      time: "14:08",
      type: "savings" as const,
      amount: monthly,
      method: "Bank transfer",
      note: "monthly" as const,
    },
    {
      date: "2026-08-19",
      time: "11:35",
      type: "savings" as const,
      amount: 15000,
      method: "Mobile Money",
      note: "extra" as const,
    },
    {
      date: "2026-09-03",
      time: "09:12",
      type: "savings" as const,
      amount: monthly,
      method: "Bank transfer",
      note: "monthly" as const,
    },
    {
      date: "2026-09-03",
      time: "09:14",
      type: "social" as const,
      amount: 5000,
      method: "Bank transfer",
      note: "social" as const,
    },
  ].map((record, i) => ({
    ...record,
    memberId: member.id,
    id: `RC-${member.id.slice(2)}-${String(i + 1).padStart(3, "0")}`,
  }));
  const recent = transactions
    .filter((tx) => tx.member === index)
    .map((tx) => ({
      id: tx.id,
      memberId: member.id,
      type: tx.type as ContributionKind,
      amount: tx.amount,
      date: tx.date,
      time: tx.time,
      method: tx.method,
      note: (tx.type === "savings" ? "monthly" : tx.type === "social" ? "social" : "penalty") as MemberRecord["note"],
    }));
  const records = [...base, ...recent].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  let balance = member.savings - records.filter((r) => r.type === "savings").reduce((sum, r) => sum + r.amount, 0);
  return records
    .map((r) => {
      if (r.type === "savings") balance += r.amount;
      return { ...r, balance };
    })
    .reverse();
}
