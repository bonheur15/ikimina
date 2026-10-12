"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Printer, Search } from "lucide-react";
import { MEMBER_FILTERS } from "@/lib/admin-types";
import { money, type Member } from "@/lib/portal-data";
import { REPORT_CATALOG, REPORT_GROUPS, reportMeta, type ReportOptions, type ReportParam, type ReportTable } from "@/lib/report-catalog";
import { findMembers } from "@/app/actions/lookup";
import { Money, useDateLabel, useT } from "./portal-ui";
import { AdminHeading } from "./admin-dashboard";
import { DataSheet } from "./data-sheet";
import { Choice } from "./ui/choice";
import { Pager, SearchBox, useUrlState } from "./url-state";

/** Report catalogue with a live preview; every report downloads as Excel, CSV or a printable PDF. Read-only. */
export function ReportsView({ id, table, params, options }: { id: string; table: ReportTable; params: Record<string, string>; options: ReportOptions }) {
  const t = useT();
  const url = useUrlState();
  const meta = reportMeta(id)!;
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const href = (path: string, extra = "") => `${path}?${[query, extra].filter(Boolean).join("&")}`;
  const choose = (report: string) => url.reset({ report });

  return <><AdminHeading title={t("Reports", "Raporo")} subtitle={t("Preview any report, then download it as Excel, CSV or PDF.", "Reba raporo iyo ari yo yose, hanyuma uyikuremo nka Excel, CSV cyangwa PDF.")} />
    <div className="reports-layout">
      <nav className="panel report-catalog" aria-label={t("Reports", "Raporo")}>
        {REPORT_GROUPS.map(group => <div key={group.id} className="report-group"><span className="eyebrow">{t(group.en, group.rw)}</span>
          {REPORT_CATALOG.filter(r => r.group === group.id).map(r => <button key={r.id} aria-current={r.id === id ? "page" : undefined} onClick={() => choose(r.id)}><FileSpreadsheet size={16} /><span><strong>{t(r.en[0], r.rw[0])}</strong><small>{t(r.en[1], r.rw[1])}</small></span></button>)}
        </div>)}
      </nav>
      <section className={`panel report-preview ${url.pending ? "is-loading" : ""}`}>
        <div className="report-head">
          <div><h2>{table.title}</h2><p>{table.subtitle}{table.total ? ` · ${table.total.toLocaleString("en-US")} ${t("rows", "imirongo")}` : ""}</p></div>
          <div className="report-actions">
            <a className="action" href={href(`/api/reports/${id}`, "format=xlsx")} download><Download size={15} />Excel</a>
            <a className="action secondary" href={href(`/api/reports/${id}`, "format=csv")} download><FileText size={15} />CSV</a>
            <a className="action secondary" href={href(`/admin/reports/print`, `report=${id}&autoprint=1`)} target="_blank" rel="noopener"><Printer size={15} />PDF</a>
          </div>
        </div>
        {meta.params.length > 0 && <div className="report-filters">{meta.params.map(p => <ParamControl key={p.key} param={p} value={params[p.key] ?? ""} params={params} options={options} onChange={value => url.set({ [p.key]: value })} />)}</div>}
        {table.summary && table.summary.length > 0 && <div className="report-summary">{table.summary.map(s => <div key={s.label}><span>{s.label}</span><strong>{s.type === "money" ? <Money amount={s.value} /> : money(s.value)}</strong></div>)}</div>}
        {table.columns.length ? <DataSheet key={`${id}-${table.columns.length}`} columns={table.columns} rows={table.rows} totals={table.totals} frozen={table.frozen} offset={(table.page - 1) * table.pageSize} pending={url.pending} label={table.title}
          footer={<Pager page={{ rows: [], total: table.total, page: table.page, pageSize: table.pageSize }} pending={url.pending} onPage={page => url.set({ page }, { resetPage: false })} noun={t("rows", "imirongo")} />} />
          : <p className="muted">{t("Choose the filters above to build this report.", "Hitamo ibisabwa hejuru kugira ngo raporo ikorwe.")}</p>}
        {table.notes?.map(note => <p key={note} className="below-note">{note}</p>)}
      </section>
    </div>
  </>;
}

function ParamControl({ param, value, params, options, onChange }: { param: ReportParam; value: string; params: Record<string, string>; options: ReportOptions; onChange: (value: string) => void }) {
  const t = useT();
  const dateLabel = useDateLabel();
  const select = (label: string, choices: [string, string][]) => <div className="field compact-field">{label}<Choice ariaLabel={label} value={value} onChange={onChange} options={choices.map(([v, l]) => ({ value: v, label: l }))} /></div>;
  const all: [string, string] = ["all", t("All years", "Imyaka yose")];
  switch (param.kind) {
    case "yearOrAll": return select(t("Period", "Igihe"), [all, ...options.years.map(y => [y, y] as [string, string])]);
    case "year": return select(t("Year", "Umwaka"), options.years.map(y => [y, y]));
    case "interestYear": return select(t("Year", "Umwaka"), options.interestYears.map(y => [y, y]));
    case "cashYear": return select(t("Year", "Umwaka"), [all, ...options.cashYears.map(y => [y, y === "—" ? t("Undated", "Nta tariki") : y] as [string, string])]);
    case "register": return select(t("Register", "Igitabo"), [["savings", t("Savings", "Ubwizigame")], ["social", t("Social fund", "Ingoboka")], ["penalty", t("Penalties", "Amande")]]);
    case "monthOrAll": return select(t("Month", "Ukwezi"), [["all", t("All months", "Amezi yose")], ...(options.months[params.kind || "savings"] ?? []).map(m => [m, dateLabel(m, true)] as [string, string])]);
    case "memberFilter": return select(t("Members", "Abanyamuryango"), MEMBER_FILTERS.map(f => [f, { all: t("Current members", "Abanyamuryango"), missing: t("Missing email", "Imeyili ibura"), "no-account": t("Can’t sign in yet", "Batarinjira"), former: t("Former members", "Abahoze") }[f]]));
    case "cashFlow": return select(t("Entries", "Ibyanditswe"), [["all", t("All entries", "Byose")], ["in", t("Money in", "Ayinjiye")], ["out", t("Money out", "Ayasohotse")]]);
    case "search": return <div className="field compact-field">{t("Search", "Shaka")}<SearchBox value={value} onSearch={onChange} label={t("Search members", "Shaka abanyamuryango")} placeholder={t("Name or member code…", "Izina cyangwa inomero…")} /></div>;
    case "member": return <MemberParam value={value} onChange={onChange} />;
  }
}

/** Member chooser for the statement report: search on the server, pick one. */
function MemberParam({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Member[]>([]);
  useEffect(() => {
    if (!query.trim()) return;
    let active = true;
    const timer = setTimeout(() => findMembers(query).then(found => { if (active) setMatches(found.slice(0, 8)); }), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  return <div className="field compact-field member-param">{t("Member", "Umunyamuryango")}
    <label className="search-input"><Search size={16} /><input value={query} placeholder={value || t("Name or member code…", "Izina cyangwa inomero…")} onChange={e => setQuery(e.target.value)} aria-label={t("Find a member", "Shaka umunyamuryango")} /></label>
    {query.trim() && matches.length > 0 && <div className="member-param-options">{matches.map(m => <button key={m.id} type="button" onClick={() => { onChange(m.id); setQuery(""); setMatches([]); }}><span className="member-code">{m.id}</span>{m.name}</button>)}</div>}
  </div>;
}
