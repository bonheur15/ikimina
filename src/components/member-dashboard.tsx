"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Coins,
  FileText,
  Heart,
  HelpCircle,
  History,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Pager, useClientPages } from "./url-state";
import { Choice } from "./ui/choice";
import {
  SHARE_VALUE,
  affectsSavings,
  chronological,
  monthlyNet,
  currentPeriod,
  downloadCsv,
  exportRecords,
  kigaliToday,
  memberRecords,
  money,
  recordShares,
  savingsBalance,
  sumRecords,
  type Member,
  type MemberRecord,
} from "@/lib/portal-data";
import { updateOwnContact } from "@/app/actions/portal";
import {
  Action,
  ActivityList,
  Avatar,
  BalanceChart,
  DownloadButton,
  EmptyState,
  KindIcon,
  KindLabel,
  Money,
  RecordDetail,
  SavingsBreakdown,
  SectionHeading,
  Stat,
  Brand,
  signed,
  useDateLabel,
  useSharesLabel,
  useRecordWhen,
  useT,
} from "./portal-ui";

import { PortalIllustration } from "./portal-illustrations";
import { SavingsCard } from "./savings-card";
import { MemberMobileMoney } from "./mobile-money-panel";
import { usePortal } from "./account-dashboard";
import { MemberPenalties } from "./penalty-assessments";
import type { MemberPenaltyPlan } from "@/lib/penalty-automation";
import { MemberSavingsWindow } from "./penalty-policy";

export type MemberTab = "home" | "money" | "history" | "statements" | "account";
type Props = {
  view: MemberTab;
  member: Member;
  records: MemberRecord[];
  navigate: (view: MemberTab) => void;
  socialMonthly: number;
  onChanged: () => void;
  language: string;
  onLanguage: (value: "en" | "rw") => void;
  onHelp: () => void;
};
export function MemberDashboard(props: Props) {
  const { penalties = [], penaltyPlan } = usePortal();
  const records = memberRecords(props.records, props.member.id);
  const [selected, setSelected] = useState<string | null>(null);
  const select = (record: MemberRecord) => setSelected(record.id);
  return (
    <>
      {props.view === "home" && <MemberHome {...props} records={records} onSelect={select} />}
      {props.view === "money" && (
        <MemberMobileMoney member={props.member} socialMonthly={props.socialMonthly} onChanged={props.onChanged} />
      )}
      {(props.view === "home" || props.view === "history") && <MemberPenalties penalties={penalties} />}
      {props.view === "history" && (
        <ContributionHistory member={props.member} records={records} onSelect={select} savingsPlan={penaltyPlan} />
      )}
      {props.view === "statements" && <MemberStatements member={props.member} records={records} />}
      {props.view === "account" && <MemberAccount {...props} />}
      <RecordDetail reference={selected} onClose={() => setSelected(null)} />
    </>
  );
}
function MemberHome({
  member,
  records,
  navigate,
  onSelect,
  socialMonthly,
}: Props & { onSelect: (record: MemberRecord) => void }) {
  const t = useT();
  const { penaltyPlan } = usePortal();
  const dateLabel = useDateLabel();
  const [hidden, setHidden] = useState(false);
  const today = kigaliToday();
  const period = currentPeriod();
  const year = period.slice(0, 4);
  const monthName = new Intl.DateTimeFormat(t("en-GB", "rw-RW"), { month: "long", timeZone: "Africa/Kigali" }).format(
    new Date(`${today}T12:00:00+02:00`),
  );
  const balance = savingsBalance(records);
  const current = records.filter((r) => r.period === period);
  const saved = sumRecords(current, "savings");
  const social = sumRecords(current, "social");
  const savingsTarget = member.monthlySavings;
  const complete = saved >= savingsTarget && social >= socialMonthly;
  const expected = savingsTarget + socialMonthly;
  const paid = saved + social;
  const progress = (Math.min(saved, savingsTarget) + Math.min(social, socialMonthly)) / expected;
  const breakdown = <SavingsBreakdown member={member} records={records} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {t("Looking good,", "Muraho,")} {member.name.split(" ")[0]}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t("Here’s where your contributions are taking you.", "Reba uko imisanzu yawe iguteza imbere.")}</p>
        </div>
        <span className="heading-date">
          {new Intl.DateTimeFormat(t("en-GB", "rw-RW"), {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Africa/Kigali",
          }).format(new Date(`${today}T12:00:00+02:00`))}
        </span>
      </div>
      <div className="overview-summary-grid">
        <SavingsCard
          variant="member"
          balance={balance}
          added={saved}
          shares={balance / SHARE_VALUE}
          memberName={member.name}
          memberId={member.id}
          hidden={hidden}
          onToggleVisibility={() => setHidden((value) => !value)}
        />
        <Stat
          icon={<ArrowDownLeftIcon />}
          label={t("Saved this year", "Ubwizigame bw’uyu mwaka")}
          amount={
            <Money
              amount={sumRecords(
                records.filter((r) => r.period.startsWith(year)),
                "savings",
              )}
            />
          }
          note={`${dateLabel(`${year}-01`, true)} – ${dateLabel(period, true)}`}
        />
        <Stat
          icon={<Sparkles size={19} />}
          tone="violet"
          label={t("Interest allocated", "Inyungu zagenewe")}
          amount={<Money amount={member.interest} />}
          note={t("All years", "Imyaka yose")}
        />
        <Stat
          icon={<Heart size={19} />}
          tone="mint"
          label={t("Social contributions", "Imisanzu y’ingoboka")}
          amount={<Money amount={sumRecords(records, "social")} />}
          note={t("Supporting our community", "Gufasha ikimina cyacu")}
        />
      </div>
      {/* Two independent column stacks, so a short card never leaves a gap beside a tall one. Without the savings window the breakdown moves to the side column to keep both columns even. */}
      <div className="member-home-columns">
        <div>
          <BalanceChart monthly={monthlyNet(records)} />
          {penaltyPlan && breakdown}
          <section className="panel member-recent-card">
            <SectionHeading
              title={t("Your recent contributions", "Imisanzu yawe iheruka")}
              subtitle={t("Every contribution has its place.", "Buri musanzu ufite umwanya.")}
              action={
                <button className="text-action" onClick={() => navigate("history")}>
                  {t("View all", "Reba yose")}
                  <ArrowRight size={15} />
                </button>
              }
            />
            <ActivityList records={records} onSelect={onSelect} limit={4} />
          </section>
        </div>
        <div>
          <section className={`panel contribution-card ${complete ? "complete" : ""}`}>
            <div className="contribution-card-top">
              <span className="eyebrow">
                {t(`${monthName.toUpperCase()} CONTRIBUTION`, `UMUSANZU WA ${monthName.toUpperCase()}`)}
              </span>
              <span className={`status-pill ${complete ? "" : "amber"}`}>
                {complete ? <Check size={12} /> : <History size={12} />}
                {complete ? t("All set", "Byuzuye") : t("In progress", "Biracyakorwa")}
              </span>
            </div>
            <div className="contribution-status">
              <div className="contribution-ring">
                <svg viewBox="0 0 72 72" aria-hidden="true">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="#e8eefb" strokeWidth="5" />
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    stroke="#0057d9"
                    strokeWidth="5"
                    strokeDasharray={`${progress * 188.5} 188.5`}
                    strokeLinecap="round"
                    transform="rotate(-90 36 36)"
                  />
                </svg>
                <span>{complete ? <Check size={25} /> : `${Math.round(progress * 100)}%`}</span>
              </div>
              <div>
                <strong>
                  {complete
                    ? t("You’re up to date", "Warangije gutanga")
                    : t("A little left to go", "Haracyabura make")}
                </strong>
                <p>
                  {money(paid)} {t("of", "kuri")} {money(expected)} RWF
                </p>
              </div>
            </div>
            <div className="contribution-parts">
              <span>
                {t("Savings", "Ubwizigame")}
                <b>{money(saved)} RWF</b>
              </span>
              <span>
                {t("Social fund", "Ingoboka")}
                <b>{money(social)} RWF</b>
              </span>
            </div>
            <button className="contribution-next" onClick={() => navigate("history")}>
              <span>
                {complete
                  ? t("Thank you for this month’s contribution", "Urakoze ku musanzu w’uku kwezi")
                  : t("See your contribution history", "Reba amateka y’imisanzu yawe")}
              </span>
              <ArrowRight size={15} />
            </button>
          </section>
          {penaltyPlan ? <MemberSavingsWindow plan={penaltyPlan} /> : breakdown}
          <section className="panel member-statement-card">
            <div className="member-card-heading">
              <span className="member-card-icon">
                <FileText size={20} />
              </span>
              <h2>{t("Your statements", "Raporo zawe")}</h2>
            </div>
            <p>
              {t(
                "Your savings, contributions and account balance in one statement.",
                "Ubwizigame, imisanzu n’amafaranga ya konti muri raporo imwe.",
              )}
            </p>
            <ul>
              <li>
                <Check size={15} />
                {t("Choose a month or year", "Hitamo ukwezi cyangwa umwaka")}
              </li>
              <li>
                <Check size={15} />
                {t("Download a copy for your records", "Kuramo kopi y’inyandiko zawe")}
              </li>
            </ul>
            <Action onClick={() => navigate("statements")}>
              {t("My statements", "Raporo zanjye")}
              <ArrowUpRight size={16} />
            </Action>
          </section>
        </div>
      </div>
    </>
  );
}
function ArrowDownLeftIcon() {
  return <Wallet size={19} />;
}

export function ContributionHistory({
  member,
  records,
  onSelect,
  admin = false,
  savingsPlan,
}: {
  member: Member;
  records: MemberRecord[];
  onSelect: (record: MemberRecord) => void;
  admin?: boolean;
  savingsPlan?: MemberPenaltyPlan;
}) {
  const t = useT();
  const sharesLabel = useSharesLabel();
  const dateLabel = useDateLabel();
  const when = useRecordWhen();
  const [kind, setKind] = useState("all");
  const [month, setMonth] = useState("all");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("timeline");
  const months = [...new Set(records.map((r) => r.period))].sort().reverse();
  const filtered = records.filter(
    (r) =>
      (kind === "all" || r.type === kind) &&
      (month === "all" || r.period === month) &&
      `${r.id} ${r.method} ${r.note} ${r.amount} ${r.date} ${r.period}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pages = useClientPages(filtered, 25);
  const groups = [...new Set(pages.rows.map((r) => r.period))].sort().reverse();
  // Running savings balance after each record, computed once for the whole history.
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    let balance = 0;
    for (const r of records.toSorted(chronological))
      if (affectsSavings(r)) {
        balance += r.amount;
        map.set(r.id, balance);
      }
    return map;
  }, [records]);
  const groupLabel = (period: string) =>
    period ? dateLabel(period, true) : t("Date not recorded", "Itariki ntiyanditswe");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("EVERY CONTRIBUTION COUNTS", "BURI MUSANZU UFITE AGACIRO")}</span>
          <h1>
            {admin ? t("Contribution history", "Amateka y’imisanzu") : t("My contributions", "Imisanzu yanjye")}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {admin
              ? t("Every record for this member, newest first.", "Inyandiko zose z’uyu munyamuryango, iziheruka mbere.")
              : t("Follow your history, one contribution at a time.", "Kurikirana amateka ya buri musanzu.")}
          </p>
        </div>
        <DownloadButton
          onClick={() =>
            exportRecords(filtered, `${member.id}-contributions.csv`, `${member.name} (${member.id}) · contributions`)
          }
        />
      </div>
      {savingsPlan && <MemberSavingsWindow plan={savingsPlan} />}
      <div className="member-stats history-stats">
        <Stat
          icon={<Coins size={19} />}
          label={t("Savings in this view", "Ubwizigame muri iki gihe")}
          amount={<Money amount={sumRecords(filtered, "savings")} />}
        />
        <Stat
          icon={<Heart size={19} />}
          tone="mint"
          label={t("Social fund", "Ikigega cy’ingoboka")}
          amount={<Money amount={sumRecords(filtered, "social")} />}
        />
        <Stat
          icon={<ShieldCheck size={19} />}
          tone="peach"
          label={t("Penalties paid", "Amande yishyuwe")}
          amount={<Money amount={sumRecords(filtered, "penalty")} />}
        />
      </div>
      <section className="panel history-panel">
        <div className="history-toolbar">
          <div className="segmented" aria-label={t("History display", "Uko amateka agaragara")}>
            <button aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}>
              <History size={16} />
              {t("Timeline", "Amateka")}
            </button>
            <button aria-pressed={mode === "ledger"} onClick={() => setMode("ledger")}>
              <FileText size={16} />
              {t("Ledger", "Urutonde")}
            </button>
          </div>
          <span className="muted">
            {filtered.length} {t("records", "inyandiko")}
          </span>
        </div>
        <div className="filter-bar">
          <label className="search-input">
            <SearchIcon />
            <input
              aria-label={t("Search contributions", "Shaka imisanzu")}
              placeholder={t("Search a reference or payment…", "Shaka inomero cyangwa ubwishyu…")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                pages.reset();
              }}
            />
          </label>
          <Choice
            size="sm"
            className="filter-choice"
            ariaLabel={t("Contribution type", "Ubwoko bw’umusanzu")}
            value={kind}
            onChange={(v) => {
              setKind(v);
              pages.reset();
            }}
            options={[
              { value: "all", label: t("All types", "Ubwoko bwose") },
              { value: "savings", label: t("Savings", "Ubwizigame") },
              { value: "social", label: t("Social fund", "Ingoboka") },
              { value: "penalty", label: t("Penalties", "Amande") },
              { value: "interest", label: t("Interest", "Inyungu") },
              { value: "adjustment", label: t("Withdrawals", "Ayakuweho") },
            ]}
          />
          <Choice
            size="sm"
            className="filter-choice"
            ariaLabel={t("Contribution month", "Ukwezi k’umusanzu")}
            value={month}
            onChange={(v) => {
              setMonth(v);
              pages.reset();
            }}
            options={[
              { value: "all", label: t("All months", "Amezi yose") },
              ...months.map((m) => ({ value: m, label: groupLabel(m) })),
            ]}
          />
        </div>
        {!filtered.length ? (
          <>
            <EmptyState
              text={t("No matching contributions", "Nta misanzu ihuye n’ibyo ushakisha")}
              detail={t("Try a different month, type or reference.", "Hindura ukwezi, ubwoko cyangwa inomero.")}
            />
            <div className="empty-action">
              <Action
                secondary
                onClick={() => {
                  setQuery("");
                  setKind("all");
                  setMonth("all");
                }}
              >
                {t("Clear filters", "Kuraho ibyo ushakisha")}
              </Action>
            </div>
          </>
        ) : mode === "timeline" ? (
          <div className="timeline">
            {groups.map((group) => (
              <section className="timeline-group" key={group}>
                <div className="timeline-month">
                  <h2>{groupLabel(group)}</h2>
                  <span>
                    {filtered.filter((r) => r.period === group).length} {t("contributions", "imisanzu")}
                  </span>
                </div>
                <div className="timeline-entries">
                  {pages.rows
                    .filter((r) => r.period === group)
                    .map((r) => (
                      <button className="timeline-entry" key={r.id} onClick={() => onSelect(r)}>
                        <KindIcon kind={r.type} />
                        <div className="timeline-content">
                          <div className="timeline-title">
                            <strong>
                              <KindLabel kind={r.type} amount={r.amount} />
                            </strong>
                            <b>
                              {signed(r.amount)} <small>RWF</small>
                            </b>
                          </div>
                          <span>
                            {r.type === "savings" && (
                              <>
                                <b>{sharesLabel(recordShares(r))}</b> ·{" "}
                              </>
                            )}
                            {r.date
                              ? when(r)
                              : r.source === "import"
                                ? t("Monthly register", "Igitabo cya buri kwezi")
                                : when(r)}
                            {r.method && ` · ${r.method}`}
                          </span>
                          <div className="timeline-bottom">
                            <span className="mono">{r.id}</span>
                            {affectsSavings(r) && (
                              <span>
                                {t("Balance", "Ubwizigame")}: <b>{money(balances.get(r.id) ?? 0)} RWF</b>
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th>{t("Contribution", "Umusanzu")}</th>
                  <th>{t("Date", "Itariki")}</th>
                  <th>{t("Amount", "Amafaranga")}</th>
                  <th>{t("Savings balance", "Ubwizigame")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label={t("Contribution", "Umusanzu")}>
                      <button className="ledger-link" onClick={() => onSelect(r)}>
                        <KindLabel kind={r.type} amount={r.amount} />
                        <small>{r.id}</small>
                      </button>
                    </td>
                    <td data-label={t("Date", "Itariki")}>{when(r)}</td>
                    <td data-label={t("Amount", "Amafaranga")}>
                      <strong>{signed(r.amount)} RWF</strong>
                    </td>
                    <td data-label={t("Savings balance", "Ubwizigame")}>
                      {affectsSavings(r) ? `${money(balances.get(r.id) ?? 0)} RWF` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={pages.page}
          onPage={(page) => {
            pages.setPage(page);
          }}
          noun={t("records", "inyandiko")}
        />
      </section>
      <p className="below-note">
        {t(
          "Records from the monthly registers show the month they count for. Payment times are in Kigali time (CAT, UTC+2).",
          "Inyandiko zo mu bitabo bya buri kwezi zerekana ukwezi zibarirwamo. Amasaha ni aya Kigali (CAT, UTC+2).",
        )}
      </p>
    </>
  );
}
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function MemberStatements({ member, records }: { member: Member; records: MemberRecord[] }) {
  const t = useT();
  const sharesLabel = useSharesLabel();
  const dateLabel = useDateLabel();
  const when = useRecordWhen();
  const years = [...new Set(records.map((r) => r.period.slice(0, 4)).filter(Boolean))].sort().reverse();
  const recentMonths = [...new Set(records.map((r) => r.period).filter(Boolean))].sort().reverse().slice(0, 12);
  const [period, setPeriod] = useState(years[0] ?? "");
  const inPeriod = (r: MemberRecord) => period === "all" || (r.period ? r.period.startsWith(period) : false);
  const filtered = records.filter(inPeriod);
  const statementPages = useClientPages(filtered, 30);
  const before = (r: MemberRecord) => period !== "all" && !!r.period && r.period < period;
  const opening = savingsBalance(records.filter(before));
  const movement = savingsBalance(filtered);
  const undated = period === "all" ? 0 : savingsBalance(records.filter((r) => !r.period));
  const closing = opening + movement;
  const label =
    period === "all" ? t("All years", "Imyaka yose") : period.length === 4 ? period : dateLabel(period, true);
  const generated = dateLabel(kigaliToday());
  const download = () =>
    downloadCsv(`${member.id}-${period}-statement.csv`, [
      ["MEMBER STATEMENT", member.name, member.id, label, `Generated ${generated}`],
      ["Opening savings (RWF)", opening],
      ["Savings contributed (RWF)", sumRecords(filtered, "savings")],
      ["Withdrawals and deductions (RWF)", sumRecords(filtered, "adjustment")],
      ["Closing savings (RWF)", closing],
      ["Social contributions (RWF)", sumRecords(filtered, "social")],
      ["Penalties paid (RWF)", sumRecords(filtered, "penalty")],
      ["Interest allocated (RWF)", sumRecords(filtered, "interest")],
      ["Reference", "Type", "Shares", "Contribution month", "Payment date", "Time (Kigali)", "Amount (RWF)", "Method"],
      ...filtered.map((r) => [
        r.id,
        r.type,
        r.type === "savings" ? recordShares(r) : "",
        r.period,
        r.date,
        r.time,
        r.amount,
        r.method,
      ]),
    ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("YOUR PERSONAL RECORDS", "INYANDIKO ZAWE")}</span>
          <h1>
            {t("My statements", "Raporo zanjye")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t("Your progress, neatly on record.", "Iterambere ryawe mu nyandiko.")}</p>
        </div>
        <DownloadButton onClick={download} />
      </div>
      <div className="statement-layout">
        <section className="panel statement-controls">
          <div className="statement-controls-art">
            <PortalIllustration asset="records" eager />
          </div>
          <SectionHeading title={t("Choose your statement", "Hitamo raporo yawe")} />
          <div className="field">
            {t("Reporting period", "Igihe cya raporo")}
            <Choice
              ariaLabel={t("Reporting period", "Igihe cya raporo")}
              value={period}
              onChange={(v) => {
                setPeriod(v);
                statementPages.reset();
              }}
              options={[
                { value: "all", label: t("All years", "Imyaka yose") },
                ...years.map((y) => ({ value: y, label: y, group: t("Years", "Imyaka") })),
                ...recentMonths.map((m) => ({
                  value: m,
                  label: dateLabel(m, true),
                  group: t("Recent months", "Amezi aheruka"),
                })),
              ]}
            />
          </div>
          <div className="statement-inclusions">
            <FileText size={23} />
            <h3>{t("What’s included", "Ibiri muri raporo")}</h3>
            {[
              t("Opening and closing savings", "Ubwizigame butangira n’ubusoza"),
              t("Savings and social contributions", "Ubwizigame n’imisanzu y’ingoboka"),
              t("Penalties and interest allocations", "Amande n’inyungu zagenewe"),
              t("Every individual record", "Buri nyandiko yose"),
            ].map((v) => (
              <p key={v}>
                <Check size={14} />
                {v}
              </p>
            ))}
          </div>
          {undated !== 0 && (
            <p className="muted">
              {t(
                `${money(Math.abs(undated))} RWF of withdrawals have no recorded date; they are included in your current balance but not in period statements.`,
                `${money(Math.abs(undated))} RWF yakuweho nta tariki ifite; ibarwa mu bwizigame bwawe ariko ntiboneka muri raporo z’igihe runaka.`,
              )}
            </p>
          )}
        </section>
        <section className="statement-paper">
          <div className="statement-paper-header">
            <Brand />
            <span className="sample-stamp">{t("MEMBER STATEMENT", "RAPORO Y’UMUNYAMURYANGO")}</span>
          </div>
          <h2>{t("Member statement", "Raporo y’umunyamuryango")}</h2>
          <p>{label}</p>
          <div className="statement-identity">
            <Avatar member={member} />
            <div>
              <strong>{member.name}</strong>
              <span>
                {member.id}
                {member.district ? ` · ${member.district}` : ""}
              </span>
            </div>
          </div>
          <dl className="statement-summary">
            <div>
              <dt>{t("Opening savings", "Ubwizigame butangira")}</dt>
              <dd>{money(opening)} RWF</dd>
            </div>
            <div>
              <dt>{t("Savings contributions", "Imisanzu y’ubwizigame")}</dt>
              <dd>+{money(sumRecords(filtered, "savings"))} RWF</dd>
            </div>
            {sumRecords(filtered, "adjustment") !== 0 && (
              <div>
                <dt>{t("Withdrawals and deductions", "Ayakuweho")}</dt>
                <dd>{signed(sumRecords(filtered, "adjustment"))} RWF</dd>
              </div>
            )}
            <div className="statement-total">
              <dt>{t("Closing savings", "Ubwizigame busoza")}</dt>
              <dd>{money(closing)} RWF</dd>
            </div>
          </dl>
          <div className="statement-other">
            <span>
              {t("Social fund", "Ingoboka")}
              <b>{money(sumRecords(filtered, "social"))} RWF</b>
            </span>
            <span>
              {t("Penalties paid", "Amande yishyuwe")}
              <b>{money(sumRecords(filtered, "penalty"))} RWF</b>
            </span>
            <span>
              {t("Interest allocated", "Inyungu zagenewe")}
              <b>{money(sumRecords(filtered, "interest"))} RWF</b>
            </span>
          </div>
          <div className="statement-records">
            <h3>
              {filtered.length} {t("records", "inyandiko")}
            </h3>
            {statementPages.rows.map((r) => (
              <div key={r.id}>
                <span>
                  <KindLabel kind={r.type} amount={r.amount} />
                  <small>
                    {r.type === "savings" && <>{sharesLabel(recordShares(r))} · </>}
                    {when(r)} · {r.id}
                  </small>
                </span>
                <b>{signed(r.amount)} RWF</b>
              </div>
            ))}
            <Pager page={statementPages.page} onPage={statementPages.setPage} noun={t("records", "inyandiko")} />
          </div>
          <div className="statement-paper-footer">
            <ShieldCheck size={16} />
            {t(`Generated ${generated} · All amounts in RWF`, `Yakozwe ${generated} · Amafaranga muri RWF`)}
          </div>
        </section>
      </div>
    </>
  );
}
function MemberAccount({ member, onChanged, language, onLanguage, onHelp }: Props) {
  const t = useT();
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("A SPACE THAT’S YOURS", "URUBUGA RWAWE BWITE")}</span>
          <h1>
            {t("My account", "Konti yanjye")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t("Your details and preferences, in one place.", "Amakuru n’amahitamo byawe hamwe.")}</p>
        </div>
      </div>
      <div className="account-layout">
        <section className="panel identity-card">
          <Avatar member={member} />
          <h2>{member.name}</h2>
          <span className="mono">{member.id}</span>
          <span className="status-pill">
            <Check size={13} />
            {member.status === "active"
              ? t("Member", "Umunyamuryango")
              : t("Former member", "Yahoze ari umunyamuryango")}
          </span>
          <dl className="detail-list">
            <div>
              <dt>{t("District", "Akarere")}</dt>
              <dd>{member.district || "—"}</dd>
            </div>
            <div>
              <dt>{t("Monthly savings", "Ubwizigame bwa buri kwezi")}</dt>
              <dd>{member.monthlySavings ? `${money(member.monthlySavings)} RWF` : "—"}</dd>
            </div>
            <div>
              <dt>{t("Share value", "Agaciro k’umugabane")}</dt>
              <dd>{money(SHARE_VALUE)} RWF</dd>
            </div>
          </dl>
        </section>
        <div className="account-sections">
          <section className="panel">
            <SectionHeading
              title={t("Contact details", "Amakuru yo kuvugana")}
              subtitle={t(
                "Keep your contact information up to date. Your email is also how you sign in.",
                "Vugurura amakuru yo kuvugana. Imeyili yawe ni nayo winjiriraho.",
              )}
            />
            <form
              className="portal-form"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const result = await updateOwnContact({ email, phone });
                  if (!result.ok) {
                    setError(result.error);
                    setSaved(false);
                    return;
                  }
                  setError("");
                  setSaved(true);
                  onChanged();
                });
              }}
            >
              <label className="field">
                {t("Email address", "Imeyili")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSaved(false);
                  }}
                  placeholder="name@example.com"
                />
              </label>
              <label className="field">
                {t("Phone number", "Telefoni")}
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <Action type="submit" busy={pending}>
                {t("Save details", "Bika amakuru")}
                <ArrowRight size={16} />
              </Action>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              {saved && (
                <p className="form-success" role="status">
                  <Check size={16} />
                  {t("Your details are saved.", "Amakuru yawe yabitswe.")}
                </p>
              )}
            </form>
          </section>
          <section className="panel">
            <SectionHeading title={t("Make yourself at home", "Hitamo ibikubereye")} />
            <div className="preference-row">
              <span>
                <strong>{t("Language", "Ururimi")}</strong>
                <small>{t("Choose how you use Elayo Family", "Hitamo ururimi ukoresha")}</small>
              </span>
              <Choice
                size="sm"
                ariaLabel={t("Account language", "Ururimi rwa konti")}
                value={language}
                onChange={(v) => onLanguage(v as "en" | "rw")}
                options={[
                  { value: "en", label: "English" },
                  { value: "rw", label: "Kinyarwanda" },
                ]}
              />
            </div>
            <button className="preference-row" onClick={onHelp}>
              <span>
                <strong>
                  <HelpCircle size={16} />
                  {t("Help & support", "Ubufasha")}
                </strong>
                <small>{t("Understanding your account and contributions", "Sobanukirwa konti n’imisanzu")}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
