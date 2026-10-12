"use client";

import { BrandLoader } from "@/components/brand-loader";

import { canEditRecords } from "@/lib/permissions";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Heart,
  List,
  Mail,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CASH_CATEGORIES,
  SHARE_VALUE,
  kigaliToday,
  money,
  principalOf,
  type Member,
  type MemberRecord,
} from "@/lib/portal-data";
import type { CashbookData, MemberFilter, MembersData, OverviewData } from "@/lib/admin-types";
import type { ReportColumn } from "@/lib/report-catalog";
import { addCashbookEntry, categorizeCashEntry, updateSettings } from "@/app/actions/portal";
import { getMemberDetail } from "@/app/actions/lookup";
import {
  Action,
  ActivityList,
  BalanceChart,
  EmptyState,
  MemberCode,
  Money,
  SectionHeading,
  Stat,
  useDateLabel,
  useT,
} from "./portal-ui";
import { ContributionHistory } from "./member-dashboard";
import { MemberAdminPanel } from "./member-admin-panel";
import { SavingsCard } from "./savings-card";
import { usePortal, useWorkspace } from "./account-dashboard";
import { Pager, ReportDownloads, SearchBox, useUrlState } from "./url-state";
import { DataSheet } from "./data-sheet";
import { Choice } from "./ui/choice";
import { DateField } from "./ui/date-field";
import { importInitialRecords } from "@/app/actions/initial-import";

export function AdminHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{t("GROUP WORKSPACE", "URUBUGA RW’IKIMINA")}</span>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function AdminOverview({ data }: { data: OverviewData }) {
  const t = useT();
  const dateLabel = useDateLabel();
  const { groupName, viewer } = usePortal();
  const { openRecord, openReceipt, navigate } = useWorkspace();
  const { expected, met } = data.participation;
  const share = expected ? met / expected : 0;
  return (
    <>
      <AdminHeading
        title={t("A stronger circle", "Ikimina gikomeye")}
        subtitle={t(
          "Your group’s progress, with every member in view.",
          "Iterambere ry’ikimina n’amakuru ya buri wese.",
        )}
        action={
          canEditRecords(viewer.role) ? (
            <Action onClick={() => openRecord("savings")}>
              <Plus size={17} />
              {t("Record shares", "Andika imigabane")}
            </Action>
          ) : undefined
        }
      />
      <div className="overview-summary-grid">
        <SavingsCard
          balance={data.principal}
          added={data.latestSavings}
          shares={data.principal / SHARE_VALUE}
          memberCount={data.activeCount}
          groupName={groupName}
        />
        <Stat
          icon={<Heart size={19} />}
          tone="mint"
          label={t("Social fund balance", "Amafaranga y’ingoboka")}
          amount={<Money amount={data.socialTotal - data.supportTotal} />}
          note={
            data.supportTotal
              ? t("Contributions less support paid", "Imisanzu ukuyemo ubufasha")
              : t("Contributions · no support recorded yet", "Imisanzu · nta bufasha buranditswe")
          }
        />
        <Stat
          icon={<Sparkles size={19} />}
          tone="violet"
          label={t("Interest allocated", "Inyungu zagenewe")}
          amount={<Money amount={data.interestTotal} />}
          note={
            data.interestYear ? t(`${data.interestYear} allocations`, `Inyungu za ${data.interestYear}`) : undefined
          }
        />
        <Stat
          icon={<Mail size={19} />}
          label={t("Accounts ready", "Konti ziteguye")}
          amount={`${data.accountsReady} / ${data.activeCount}`}
          note={t(`${data.missingEmail} emails still missing`, `Imeyili ${data.missingEmail} ziracyabura`)}
        />
      </div>
      <div className="member-middle-grid">
        <BalanceChart monthly={data.series} group />
        <section className="panel participation-card">
          <SectionHeading
            title={
              data.latestPeriod
                ? t(
                    `${dateLabel(data.latestPeriod, true)} participation`,
                    `Abatanze ${dateLabel(data.latestPeriod, true)}`,
                  )
                : t("Participation", "Abatanze")
            }
            subtitle={t("Latest month in the savings register", "Ukwezi guheruka mu gitabo cy’ubwizigame")}
          />
          <strong>
            {met}
            <small> / {expected}</small>
          </strong>
          <p>{t("members met their monthly savings", "barangije ubwizigame bwa buri kwezi")}</p>
          <div className="participation-track">
            <span style={{ width: `${share * 100}%` }} />
          </div>
          <div className="participation-footer">
            <span>
              {expected - met} {t("below their usual amount", "batagejeje ku musanzu usanzwe")}
            </span>
            <b>{Math.round(share * 100)}%</b>
          </div>
          <button className="text-action" onClick={() => navigate("contributions")}>
            {t("Open savings register", "Fungura igitabo cy’ubwizigame")}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <div className="admin-activity-grid">
        <section className="panel">
          <SectionHeading
            title={t("Latest contributions", "Imisanzu iheruka")}
            subtitle={t("Connected to the people behind them.", "Ihujwe n’abayitanze.")}
            action={
              <button className="text-action" onClick={() => navigate("contributions")}>
                {t("View all", "Reba yose")}
                <ArrowRight size={15} />
              </button>
            }
          />
          <ActivityList records={data.recent} onSelect={(r) => openReceipt(r.id)} showMember />
        </section>
        <section className="panel attention-panel">
          <SectionHeading
            title={t("A little attention", "Ibyo kwitaho")}
            subtitle={t("Keep your circle moving.", "Fasha ikimina gutera imbere.")}
          />
          <button className="attention-row" onClick={() => navigate("members")}>
            <span className="stat-icon peach">
              <Mail size={18} />
            </span>
            <div>
              <strong>
                {data.missingEmail} {t("emails to collect", "imeyili zo gukusanya")}
              </strong>
              <span>
                {t(
                  `${data.activeCount - data.accountsReady} members can’t sign in yet`,
                  `Abanyamuryango ${data.activeCount - data.accountsReady} ntibarinjira`,
                )}
              </span>
            </div>
            <ChevronRight size={17} />
          </button>
          <Link className="attention-row" href="/admin/reports?report=import-review">
            <span className="stat-icon blue">
              <FileSpreadsheet size={18} />
            </span>
            <div>
              <strong>{t("Import review", "Isuzuma ry’ibyinjijwe")}</strong>
              <span>{t("Differences found in the source workbooks", "Ibitandukanye byabonetse mu mbonerahamwe")}</span>
            </div>
            <ChevronRight size={17} />
          </Link>
          <button className="attention-row" onClick={() => navigate("reports")}>
            <span className="stat-icon mint">
              <FileText size={18} />
            </span>
            <div>
              <strong>{t("Reports", "Raporo")}</strong>
              <span>
                {t("Contributions, balances and interest by year", "Imisanzu, ubwizigame n’inyungu buri mwaka")}
              </span>
            </div>
            <ChevronRight size={17} />
          </button>
        </section>
      </div>
    </>
  );
}

export function AdminMembers({ data }: { data: MembersData }) {
  const t = useT();
  const url = useUrlState();
  const { refresh, openReceipt } = useWorkspace();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ member: Member; records: MemberRecord[] } | null>(null);
  const load = (code: string) => getMemberDetail(code).then(setDetail);
  const open = (code: string) => {
    setOpenCode(code);
    setDetail(null);
    void load(code);
  };
  const changed = () => {
    refresh();
    if (openCode) void load(openCode);
  };
  const accountLabel = (m: Member) =>
    m.account === "active"
      ? t("Can sign in", "Ashobora kwinjira")
      : m.account === "invited"
        ? t("Link sent", "Ihuza ryoherejwe")
        : m.account === "blocked"
          ? t("Blocked", "Yahagaritswe")
          : t("No account", "Nta konti");
  const filters: [MemberFilter, string][] = [
    ["all", t("Current members", "Abanyamuryango")],
    ["missing", t("Missing email", "Imeyili ibura")],
    ["no-account", t("Can’t sign in yet", "Batarinjira")],
    ["former", t("Former", "Abahoze")],
  ];
  return (
    <>
      <AdminHeading
        title={t("The people in your circle", "Abanyamuryango b’ikimina")}
        subtitle={t(
          "Profiles, balances, sign-in accounts and every member’s history.",
          "Amakuru, ubwizigame, konti n’amateka ya buri wese.",
        )}
        action={<ReportDownloads report="member-register" params={{ filter: data.filter, q: data.q }} />}
      />
      <section className={`panel ${url.pending ? "is-loading" : ""}`}>
        <div className="history-toolbar">
          <div className="segmented">
            {filters.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={data.filter === value}
                onClick={() => url.set({ filter: value === "all" ? null : value })}
              >
                {label}
                <span>{data.counts[value]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="member-search">
          <SearchBox
            value={data.q}
            onSearch={(q) => url.set({ q })}
            label={t("Search members", "Shaka abanyamuryango")}
            placeholder={t(
              "Find a member by name, code, district or contact…",
              "Shaka izina, inomero, akarere cyangwa aho avugirwa…",
            )}
          />
        </div>
        <div className="table-wrap">
          <table className="record-table member-table">
            <thead>
              <tr>
                <th>{t("Member", "Umunyamuryango")}</th>
                <th>{t("District", "Akarere")}</th>
                <th>{t("Savings", "Ubwizigame")}</th>
                <th>{t("Shares", "Imigabane")}</th>
                <th>{t("Account", "Konti")}</th>
                <th>
                  <span className="sr-only">{t("History", "Amateka")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.page.rows.map((m) => (
                <tr key={m.id}>
                  <td data-label={t("Member", "Umunyamuryango")}>
                    <button className="member-link" onClick={() => open(m.id)}>
                      <MemberCode code={m.id} />
                      <span>
                        <strong>{m.name}</strong>
                        <small>{m.email || t("Email needed", "Imeyili irakenewe")}</small>
                      </span>
                    </button>
                  </td>
                  <td data-label={t("District", "Akarere")}>{m.district || "—"}</td>
                  <td data-label={t("Savings", "Ubwizigame")}>
                    <b>{money(principalOf(m))} RWF</b>
                  </td>
                  <td data-label={t("Shares", "Imigabane")}>{money(principalOf(m) / SHARE_VALUE)}</td>
                  <td data-label={t("Account", "Konti")}>
                    <span className={`status-pill ${m.account === "active" ? "" : "amber"}`}>
                      {m.account === "active" ? <Check size={12} /> : <Mail size={12} />}
                      {accountLabel(m)}
                    </span>
                  </td>
                  <td className="table-action">
                    <button
                      className="icon-button"
                      aria-label={`${t("Open", "Fungura")} ${m.name}`}
                      onClick={() => open(m.id)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.page.rows.length && <EmptyState text={t("No members found", "Nta munyamuryango wabonetse")} />}
        <Pager
          page={data.page}
          pending={url.pending}
          onPage={(page) => url.set({ page }, { resetPage: false })}
          noun={t("members", "abanyamuryango")}
        />
      </section>
      <Sheet
        open={!!openCode}
        onOpenChange={(next) => {
          if (!next) {
            setOpenCode(null);
            setDetail(null);
          }
        }}
      >
        <SheetContent className="member-sheet">
          <SheetHeader>
            <SheetTitle>{detail?.member.name ?? openCode}</SheetTitle>
            <SheetDescription>
              {openCode}
              {detail?.member.district ? ` · ${detail.member.district}` : ""}
            </SheetDescription>
          </SheetHeader>
          {detail ? (
            <>
              <MemberAdminPanel key={detail.member.id} member={detail.member} onChanged={changed} />
              <ContributionHistory
                key={`history-${detail.member.id}`}
                admin
                member={detail.member}
                records={detail.records}
                onSelect={(r) => openReceipt(r.id)}
              />
            </>
          ) : (
            <div className="dialog-loading">
              <BrandLoader label={t("Loading…", "Tegereza gato…")} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AdminCashbook({ data }: { data: CashbookData }) {
  const t = useT();
  const editable = canEditRecords(usePortal().viewer.role);
  const dateLabel = useDateLabel();
  const url = useUrlState();
  const { refresh } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const { summary } = data;
  const sheet = data.view === "sheet";
  const categoryOptions = [
    { value: "", label: t("Uncategorized", "Nta cyiciro") },
    ...CASH_CATEGORIES.map((c) => ({ value: c, label: c })),
  ];
  const categorize = (id: string, category: string) =>
    start(async () => {
      const r = await categorizeCashEntry(id, category);
      if (r.ok) refresh();
    });
  return (
    <>
      <AdminHeading
        title={t("Follow the money", "Kurikirana amafaranga")}
        subtitle={t(
          "The petty-cash book: receipts, spending and a running balance.",
          "Igitabo cy’amafaranga mato: ayakiriwe, ayasohotse n’asigaye.",
        )}
        action={
          <div className="heading-actions">
            <Choice
              size="sm"
              ariaLabel={t("Cashbook year", "Umwaka w’igitabo cy’imari")}
              value={data.year}
              onChange={(year) => url.set({ year })}
              options={[
                { value: "all", label: t("All years", "Imyaka yose") },
                ...data.years.map((y) => ({ value: y, label: y === "—" ? t("Undated", "Nta tariki") : y })),
              ]}
            />
            {editable && (
              <Action onClick={() => setAdding(true)}>
                <Plus size={16} />
                {t("Add entry", "Ongeramo")}
              </Action>
            )}
          </div>
        }
      />
      <div className="cash-summary">
        <div>
          <span>{t("Opening balance", "Amafaranga atangira")}</span>
          <strong>
            <Money amount={summary.opening} />
          </strong>
        </div>
        <span>+</span>
        <div>
          <span>{t("Money in", "Amafaranga yinjiye")}</span>
          <strong className="positive">
            <Money amount={summary.moneyIn} />
          </strong>
        </div>
        <span>−</span>
        <div>
          <span>{t("Money out", "Amafaranga yasohotse")}</span>
          <strong>
            <Money amount={summary.moneyOut} />
          </strong>
        </div>
        <span>=</span>
        <div className="cash-closing">
          <span>{t("Closing balance", "Amafaranga asigaye")}</span>
          <strong>
            <Money amount={summary.closing} />
          </strong>
        </div>
      </div>
      <section className={`panel ${url.pending ? "is-loading" : ""}`}>
        <SectionHeading
          title={data.year === "all" ? t("All entries", "Byose") : data.year}
          subtitle={
            sheet
              ? t(`${summary.entries} entries · in book order`, `Inyandiko ${summary.entries} · uko zikurikirana`)
              : t(`${summary.entries} entries · newest first`, `Inyandiko ${summary.entries} · iziheruka mbere`)
          }
          action={<ReportDownloads report="cashbook" params={{ year: data.year, flow: data.flow }} />}
        />
        <div className="history-toolbar">
          <div className="segmented cash-filters">
            {(
              [
                ["all", t("All entries", "Byose")],
                ["in", t("Money in", "Ayinjiye")],
                ["out", t("Money out", "Ayasohotse")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={data.flow === value}
                onClick={() => url.set({ flow: value === "all" ? null : value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="segmented" aria-label={t("Cashbook display", "Uko igitabo kigaragara")}>
            <button aria-pressed={!sheet} onClick={() => url.set({ view: null })}>
              <List size={15} />
              {t("Entries", "Ibyanditswe")}
            </button>
            <button aria-pressed={sheet} onClick={() => url.set({ view: "sheet" })}>
              <FileSpreadsheet size={15} />
              {t("Sheet", "Imbonerahamwe")}
            </button>
          </div>
        </div>
        {sheet ? (
          <CashbookSheet
            data={data}
            pending={url.pending}
            onYear={(year) => url.set({ year })}
            onPage={(page) => url.set({ page }, { resetPage: false })}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="record-table cash-table">
                <thead>
                  <tr>
                    <th>{t("Entry", "Igikorwa")}</th>
                    <th>{t("Date", "Itariki")}</th>
                    <th>{t("Category", "Icyiciro")}</th>
                    <th>{t("Money in", "Ayinjiye")}</th>
                    <th>{t("Money out", "Ayasohotse")}</th>
                    <th>{t("Balance", "Asigaye")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.page.rows.map((e) => (
                    <tr key={e.id}>
                      <td data-label={t("Entry", "Igikorwa")}>
                        <strong>{e.description}</strong>
                        <small>
                          #{e.position}
                          {e.comment && (
                            <span className="cash-comment" title={e.comment}>
                              <MessageSquare size={12} />
                              {e.comment}
                            </span>
                          )}
                        </small>
                      </td>
                      <td data-label={t("Date", "Itariki")}>
                        {e.date ? (
                          dateLabel(e.date)
                        ) : (
                          <span className="muted">{e.dateText || t("No date", "Nta tariki")}</span>
                        )}
                        {e.dateInferred && <small>{t(`Written “${e.dateText}”`, `Byanditswe “${e.dateText}”`)}</small>}
                      </td>
                      <td data-label={t("Category", "Icyiciro")}>
                        <Choice
                          size="sm"
                          ariaLabel={t("Category", "Icyiciro")}
                          value={e.category}
                          disabled={pending || !editable}
                          onChange={(category) => categorize(e.id, category)}
                          options={categoryOptions}
                        />
                      </td>
                      <td data-label={t("Money in", "Ayinjiye")} className="positive">
                        {e.moneyIn ? `${money(e.moneyIn)} RWF` : "—"}
                      </td>
                      <td data-label={t("Money out", "Ayasohotse")}>{e.moneyOut ? `${money(e.moneyOut)} RWF` : "—"}</td>
                      <td data-label={t("Balance", "Asigaye")}>
                        <b>{money(e.balance)} RWF</b>
                        {e.sourceBalance != null && Math.abs(e.sourceBalance - e.balance) > 0.5 && (
                          <small className="amber-text">
                            {t(`Workbook: ${money(e.sourceBalance)}`, `Mu mbonerahamwe: ${money(e.sourceBalance)}`)}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.page.rows.length && <EmptyState text={t("No entries for this filter", "Nta nyandiko zihari")} />}
            <Pager
              page={data.page}
              pending={url.pending}
              onPage={(page) => url.set({ page }, { resetPage: false })}
              noun={t("entries", "inyandiko")}
            />
          </>
        )}
      </section>
      <p className="below-note">
        {t(
          "Balances follow the order of the book. Where the workbook’s own balance differs, it is shown underneath for comparison. Savings balances and available cash are different measures.",
          "Ayasigaye akurikiza uko igitabo cyanditse. Aho imbonerahamwe ifite ayandi, agaragazwa munsi kugira ngo bigereranywe. Ubwizigame n’amafaranga ahari biratandukanye.",
        )}
      </p>
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          setError("");
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>{t("Add a cashbook entry", "Ongeramo mu gitabo cy’imari")}</DialogTitle>
            <DialogDescription>
              {t(
                "Record money received into or paid out of petty cash.",
                "Andika amafaranga yinjiye cyangwa yasohotse.",
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            className="portal-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              start(async () => {
                const result = await addCashbookEntry({
                  date: String(form.get("date")),
                  description: String(form.get("description")),
                  direction: String(form.get("direction")) as "out",
                  amount: Number(form.get("amount")),
                  category: String(form.get("category")),
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setAdding(false);
                setError("");
                refresh();
              });
            }}
          >
            <fieldset className="direction-toggle">
              <legend>{t("Type of entry", "Ubwoko")}</legend>
              <label className="direction-option out">
                <input type="radio" name="direction" value="out" defaultChecked />
                <span className="direction-icon">
                  <ArrowUpRight size={18} />
                </span>
                <span>
                  <strong>{t("Money out", "Ayasohotse")}</strong>
                  <small>{t("Paid from petty cash", "Ayishyuwe mu mafaranga mato")}</small>
                </span>
              </label>
              <label className="direction-option in">
                <input type="radio" name="direction" value="in" />
                <span className="direction-icon">
                  <ArrowDownLeft size={18} />
                </span>
                <span>
                  <strong>{t("Money in", "Ayinjiye")}</strong>
                  <small>{t("Added to petty cash", "Yongewe mu mafaranga mato")}</small>
                </span>
              </label>
            </fieldset>
            <label className="field">
              {t("Description", "Ibisobanuro")}
              <input
                name="description"
                maxLength={200}
                required
                placeholder={t("For example, transport to the bank", "Urugero: urugendo rujya kuri banki")}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                {t("Amount (RWF)", "Amafaranga (RWF)")}
                <input name="amount" type="number" min="1" step="1" required />
              </label>
              <div className="field">
                {t("Date", "Itariki")}
                <DateField
                  name="date"
                  defaultValue={kigaliToday()}
                  max={kigaliToday()}
                  required
                  ariaLabel={t("Date", "Itariki")}
                />
              </div>
            </div>
            <div className="field">
              {t("Category", "Icyiciro")}
              <Choice
                name="category"
                defaultValue="Other"
                ariaLabel={t("Category", "Icyiciro")}
                options={categoryOptions.filter((o) => o.value)}
              />
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Action type="submit" busy={pending}>
              <Plus size={16} />
              {t("Add entry", "Ongeramo")}
            </Action>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminSettings({ needsRecords = false }: { needsRecords?: boolean }) {
  const t = useT();
  const { groupName, socialMonthly, language, setLanguage, refresh } = usePortal();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <AdminHeading
        title={t("Your group, your way", "Ikimina cyanyu")}
        subtitle={t("Workspace details and language preferences.", "Amakuru y’urubuga n’ururimi.")}
      />
      {needsRecords && <InitialImport />}
      <section className="panel settings-card">
        <SectionHeading title={t("Group details", "Amakuru y’ikimina")} />
        <form
          className="portal-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            start(async () => {
              const result = await updateSettings({
                groupName: String(form.get("groupName")),
                socialMonthly: Number(form.get("socialMonthly")),
              });
              if (!result.ok) {
                setError(result.error);
                setSaved(false);
                return;
              }
              setError("");
              setSaved(true);
              refresh();
            });
          }}
          onChange={() => setSaved(false)}
        >
          <label className="field">
            {t("Group name", "Izina ry’ikimina")}
            <input name="groupName" defaultValue={groupName} maxLength={60} required pattern=".*\S.*" />
          </label>
          <div className="form-grid">
            <label className="field">
              {t("Currency", "Ifaranga")}
              <input readOnly value="RWF · Rwandan franc" />
            </label>
            <label className="field">
              {t("Share value", "Agaciro k’umugabane")}
              <input readOnly value={`${money(SHARE_VALUE)} RWF`} />
            </label>
          </div>
          <label className="field">
            {t("Monthly social contribution (RWF)", "Umusanzu w’ingoboka wa buri kwezi (RWF)")}
            <input name="socialMonthly" type="number" min="1" step="1" defaultValue={socialMonthly} required />
          </label>
          <div className="field">
            {t("Language", "Ururimi")}
            <Choice
              value={language}
              onChange={(value) => setLanguage(value as "en" | "rw")}
              ariaLabel={t("Language", "Ururimi")}
              options={[
                { value: "en", label: "English" },
                { value: "rw", label: "Kinyarwanda" },
              ]}
            />
          </div>
          <Action type="submit" busy={pending}>
            {t("Save settings", "Bika")}
          </Action>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="form-success">
              <Check size={16} />
              {t("Settings saved.", "Byabitswe.")}
            </p>
          )}
        </form>
      </section>
      <section className="panel settings-card">
        <SectionHeading title={t("Security", "Umutekano")} />
        <p className="muted">
          <ShieldCheck size={14} />{" "}
          {t(
            "Members only ever see their own records. Every change made here is kept in an audit log.",
            "Abanyamuryango babona inyandiko zabo gusa. Buri gihinduwe kibikwa mu nyandiko z’igenzura.",
          )}
        </p>
      </section>
    </>
  );
}

/** The petty-cash book laid out like the original Cashbook sheet, in book order with a running balance. */
function CashbookSheet({
  data,
  pending,
  onYear,
  onPage,
}: {
  data: CashbookData;
  pending: boolean;
  onYear: (year: string) => void;
  onPage: (page: number) => void;
}) {
  const t = useT();
  const columns: ReportColumn[] = [
    { key: "position", label: "#", type: "number", width: 56 },
    { key: "date", label: t("Date", "Itariki"), type: "date", width: 110 },
    { key: "written", label: t("Date as written", "Itariki uko yanditswe"), type: "text", width: 110 },
    { key: "description", label: t("Description", "Ibisobanuro"), type: "text", width: 300 },
    { key: "category", label: t("Category", "Icyiciro"), type: "text", width: 130 },
    { key: "in", label: t("Money in", "Ayinjiye"), type: "money", width: 110 },
    { key: "out", label: t("Money out", "Ayasohotse"), type: "money", width: 110 },
    { key: "balance", label: t("Balance", "Asigaye"), type: "money", width: 110 },
    { key: "workbook", label: t("Workbook balance", "Asigaye mu mbonerahamwe"), type: "money", width: 140 },
    { key: "comment", label: t("Comment", "Igitekerezo"), type: "text", width: 280 },
  ];
  const rows = data.page.rows.map((e) => ({
    position: e.position,
    date: e.date || null,
    written: e.dateText || null,
    description: e.description,
    category: e.category || null,
    in: e.moneyIn || null,
    out: e.moneyOut || null,
    balance: e.balance,
    workbook: e.sourceBalance,
    comment: e.comment || null,
  }));
  return (
    <DataSheet
      columns={columns}
      rows={rows}
      frozen={2}
      offset={(data.page.page - 1) * data.page.pageSize}
      pending={pending}
      label={t("Cashbook sheet", "Imbonerahamwe y’igitabo cy’imari")}
      totals={{
        description: t("Total", "Igiteranyo"),
        in: data.summary.moneyIn,
        out: data.summary.moneyOut,
        balance: data.summary.closing,
      }}
      footer={
        <>
          <nav className="wb-tabs rs-year-tabs" aria-label={t("Years", "Imyaka")}>
            {["all", ...data.years.toReversed()].map((y) => (
              <button
                key={y}
                type="button"
                aria-current={data.year === y ? "page" : undefined}
                onClick={() => onYear(y)}
              >
                {y === "all" ? t("All years", "Imyaka yose") : y === "—" ? t("Undated", "Nta tariki") : y}
              </button>
            ))}
          </nav>
          <Pager page={data.page} pending={pending} onPage={onPage} noun={t("entries", "inyandiko")} />
        </>
      }
    />
  );
}

/** Shown only on a fresh installation (no members yet): loads the group's two source workbooks once. */
function InitialImport() {
  const t = useT();
  const { refresh } = useWorkspace();
  const [state, action, pending] = useActionState(importInitialRecords, {});
  useEffect(() => {
    if (state.done) refresh();
  }, [state.done, refresh]);
  return (
    <section className="panel settings-card initial-import">
      <SectionHeading
        title={t("Load the group’s records", "Injiza inyandiko z’ikimina")}
        subtitle={t(
          "This database is empty. Upload the two Excel files once to load members, contributions, interest and the cashbook. This option disappears afterwards.",
          "Ububiko nta makuru burimo. Ohereza dosiye ebyiri za Excel rimwe gusa. Iyi ntambwe izahita ivaho.",
        )}
      />
      {state.done ? (
        <p role="status" className="form-success">
          <Check size={16} />
          {state.done}
        </p>
      ) : (
        <form action={action} className="portal-form">
          <FilePick
            name="savings"
            label={t("Savings workbook", "Imbonerahamwe y’ubwizigame")}
            hint="TOOLS FOR SAVINGS FOR SOFTWARE.xlsx"
          />
          <FilePick
            name="roster"
            label={t("Member email register", "Urutonde rw’imeyili z’abanyamuryango")}
            hint="Account_creation_Member_Email_Collection.xlsx"
          />
          {state.error && (
            <p role="alert" className="form-error">
              {state.error}
            </p>
          )}
          <Action type="submit" busy={pending}>
            <Upload size={16} />
            {t("Load records", "Injiza inyandiko")}
          </Action>
        </form>
      )}
    </section>
  );
}

/** File input styled as a drop-zone-like button that shows the chosen file name. */
function FilePick({ name, label, hint }: { name: string; label: string; hint: string }) {
  const t = useT();
  const [file, setFile] = useState("");
  return (
    <label className={`file-pick ${file ? "has-file" : ""}`}>
      <input
        type="file"
        name={name}
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        required
        onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")}
      />
      <span className="file-pick-icon">
        <FileSpreadsheet size={20} />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{file || hint}</small>
      </span>
      <span className="file-pick-action">{file ? t("Change", "Hindura") : t("Choose file", "Hitamo dosiye")}</span>
    </label>
  );
}
