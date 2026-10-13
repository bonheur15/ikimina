// The reports administrators can preview and download. Shared by the server (builders, downloads)
// and the browser (catalogue, filters). Reports only read data; nothing here changes records.

export type ReportCell = string | number | null;
export type ReportColumnType = "text" | "money" | "number" | "shares" | "date" | "month";
export type ReportColumn = { key: string; label: string; type: ReportColumnType; width?: number };
export type ReportTable = {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Rows across all pages. */
  total: number;
  page: number;
  pageSize: number;
  totals?: Record<string, ReportCell>;
  summary?: { label: string; value: number; type: "money" | "number" }[];
  notes?: string[];
  /** Leading columns kept in view while scrolling sideways. */
  frozen?: number;
};

/** Filter controls a report can take; the key is also the URL parameter name. */
export type ReportParam =
  | { key: "period"; kind: "yearOrAll" }
  | { key: "year"; kind: "year" | "yearOrAll" | "interestYear" | "cashYear" }
  | { key: "month"; kind: "monthOrAll" }
  | { key: "kind"; kind: "register" }
  | { key: "member"; kind: "member" }
  | { key: "filter"; kind: "memberFilter" }
  | { key: "flow"; kind: "cashFlow" }
  | { key: "q"; kind: "search" };

export type ReportGroup = "finances" | "members" | "registers" | "cashbook" | "quality";
export type ReportMeta = {
  id: string;
  group: ReportGroup;
  en: [string, string];
  rw: [string, string];
  params: ReportParam[];
};

export const REPORT_GROUPS: { id: ReportGroup; en: string; rw: string }[] = [
  { id: "finances", en: "Group finances", rw: "Imari y’ikimina" },
  { id: "members", en: "Members", rw: "Abanyamuryango" },
  { id: "registers", en: "Registers", rw: "Ibitabo by’imisanzu" },
  { id: "cashbook", en: "Cashbook", rw: "Igitabo cy’imari" },
  { id: "quality", en: "Data checks", rw: "Igenzura ry’amakuru" },
];

export const REPORT_CATALOG: ReportMeta[] = [
  {
    id: "financial-summary",
    group: "finances",
    params: [{ key: "period", kind: "yearOrAll" }],
    en: [
      "Financial summary",
      "Savings, social fund, penalties, interest and petty-cash spending for a year or all years.",
    ],
    rw: ["Incamake y’imari", "Ubwizigame, ingoboka, amande, inyungu n’ayasohotse mu mwaka cyangwa imyaka yose."],
  },
  {
    id: "yearly-comparison",
    group: "finances",
    params: [],
    en: ["Year-by-year comparison", "Every category side by side for each year since the group started."],
    rw: ["Kugereranya imyaka", "Buri cyiciro ku mwaka kuva ikimina cyatangira."],
  },
  {
    id: "monthly-collections",
    group: "finances",
    params: [{ key: "year", kind: "year" }],
    en: ["Monthly collections", "What came in each month of a year, and how many members saved."],
    rw: ["Ibyakiriwe buri kwezi", "Ibyinjiye buri kwezi n’umubare w’abizigamye."],
  },
  {
    id: "member-balances",
    group: "members",
    params: [],
    en: ["Member balances", "Savings principal, shares and allocated interest for every member."],
    rw: ["Ubwizigame bw’abanyamuryango", "Ubwizigame shingiro, imigabane n’inyungu za buri wese."],
  },
  {
    id: "member-statement",
    group: "members",
    params: [
      { key: "member", kind: "member" },
      { key: "period", kind: "yearOrAll" },
    ],
    en: ["Member statement", "One member’s records with opening and closing savings."],
    rw: ["Raporo y’umunyamuryango", "Inyandiko z’umunyamuryango umwe n’ubwizigame butangira n’ubusoza."],
  },
  {
    id: "interest-allocation",
    group: "members",
    params: [{ key: "year", kind: "interestYear" }],
    en: ["Interest allocation", "Interest assigned to each member for a year."],
    rw: ["Igabana ry’inyungu", "Inyungu buri munyamuryango yagenewe mu mwaka."],
  },
  {
    id: "member-register",
    group: "members",
    params: [
      { key: "filter", kind: "memberFilter" },
      { key: "q", kind: "search" },
    ],
    en: ["Member register", "Contact details, status and sign-in accounts."],
    rw: ["Urutonde rw’abanyamuryango", "Aho bavugirwa, uko bahagaze na konti zabo."],
  },
  {
    id: "register-sheet",
    group: "registers",
    params: [
      { key: "kind", kind: "register" },
      { key: "year", kind: "yearOrAll" },
      { key: "q", kind: "search" },
    ],
    en: ["Register sheet", "Members by month, like the Excel register, with yearly totals."],
    rw: ["Imbonerahamwe y’igitabo", "Abanyamuryango ku kwezi nk’uko biri muri Excel, n’ibiteranyo by’umwaka."],
  },
  {
    id: "register-summary",
    group: "registers",
    params: [
      { key: "kind", kind: "register" },
      { key: "month", kind: "monthOrAll" },
      { key: "q", kind: "search" },
    ],
    en: ["Register member summary", "What each member paid in a month or overall."],
    rw: ["Incamake ya buri munyamuryango", "Ibyo buri wese yatanze mu kwezi cyangwa byose."],
  },
  {
    id: "register-payments",
    group: "registers",
    params: [
      { key: "kind", kind: "register" },
      { key: "month", kind: "monthOrAll" },
      { key: "q", kind: "search" },
    ],
    en: ["Register payments", "Every payment with its reference, month and source."],
    rw: ["Ubwishyu bwose", "Buri bwishyu n’inomero yabwo, ukwezi n’aho bwavuye."],
  },
  {
    id: "cashbook",
    group: "cashbook",
    params: [
      { key: "year", kind: "cashYear" },
      { key: "flow", kind: "cashFlow" },
    ],
    en: ["Cashbook", "Petty-cash entries in book order with running balance."],
    rw: ["Igitabo cy’imari", "Ibyanditswe mu mafaranga mato uko bikurikirana n’asigaye."],
  },
  {
    id: "cashbook-categories",
    group: "cashbook",
    params: [{ key: "year", kind: "cashYear" }],
    en: ["Spending by category", "Petty-cash money in and out per category."],
    rw: ["Ayasohotse ku byiciro", "Amafaranga mato yinjiye n’ayasohotse kuri buri cyiciro."],
  },
  {
    id: "import-review",
    group: "quality",
    params: [],
    en: ["Import review", "Differences found in the source workbooks that need a decision."],
    rw: ["Isuzuma ry’ibyinjijwe", "Ibitandukanye byabonetse mu mbonerahamwe bikeneye icyemezo."],
  },
];

export const reportMeta = (id: string) => REPORT_CATALOG.find((r) => r.id === id);
export type ReportOptions = {
  years: string[];
  interestYears: string[];
  cashYears: string[];
  months: Record<string, string[]>;
};

const numberText = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

/** Text shown for a report cell (used by the preview grid and the print view). */
export function formatReportCell(column: Pick<ReportColumn, "type">, value: ReportCell, lang: "en" | "rw" = "en") {
  if (value == null || value === "") return "";
  const locale = lang === "rw" ? "rw-RW" : "en-GB";
  switch (column.type) {
    case "money":
    case "number":
    case "shares":
      return typeof value === "number" ? numberText(value) : String(value);
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
            new Date(`${value}T12:00:00Z`),
          )
        : String(value);
    case "month":
      return typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
        ? new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
            new Date(`${value}-15T12:00:00Z`),
          )
        : String(value);
    default:
      return String(value);
  }
}
