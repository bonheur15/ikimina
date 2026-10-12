"use client";

import { ArrowUpRight, Coins, FileSpreadsheet, Heart, History, List, Plus, ShieldCheck, Users, Wallet } from "lucide-react";
import { SHARE_VALUE, money, type Member } from "@/lib/portal-data";
import type { RegisterData, RegisterTab } from "@/lib/admin-types";
import { Action, ActivityList, EmptyState, MemberCode, Money, SectionHeading, Stat, useDateLabel, useT } from "./portal-ui";
import { usePortal, useWorkspace } from "./account-dashboard";
import { Pager, ReportDownloads, SearchBox, useUrlState } from "./url-state";
import { RegisterSheet } from "./register-sheet";
import { Choice } from "./ui/choice";

export function ContributionRegister({ data }: { data: RegisterData }) {
  const t = useT();
  const dateLabel = useDateLabel();
  const url = useUrlState();
  const { openRecord, openReceipt } = useWorkspace();
  const { socialMonthly } = usePortal();
  const { kind, tab, period, stats } = data;
  const title = kind === "savings" ? t("Savings contributions", "Imisanzu y’ubwizigame") : kind === "social" ? t("Social fund", "Ikigega cy’ingoboka") : t("Penalty payments", "Ubwishyu bw’amande");
  const recordLabel = kind === "savings" ? t("Record shares", "Andika imigabane") : kind === "social" ? t("Record social contribution", "Andika umusanzu w’ingoboka") : t("Record penalty payment", "Andika ubwishyu bw’amande");
  const commitment = (member: Member) => kind === "savings" ? member.monthlySavings : socialMonthly;
  const setPage = (page: number) => url.set({ page }, { resetPage: false });
  const tabs: [RegisterTab, string, typeof List][] = [["payments", t("Payments", "Ubwishyu"), List], ["members", t("Member summary", "Incamake ya buri wese"), Users], ["sheet", t("Sheet", "Imbonerahamwe"), FileSpreadsheet]];
  // Downloads use the matching report, with the same filters as the screen.
  const download: { report: string; params: Record<string, string> } = tab === "sheet" ? { report: "register-sheet", params: { kind, year: data.sheet?.year ?? "all", q: data.q } }
    : { report: tab === "members" ? "register-summary" : "register-payments", params: { kind, month: period, q: data.q } };

  return <>
    <div className="page-heading"><div><span className="eyebrow">{t("GROUP WORKSPACE", "URUBUGA RW’IKIMINA")}</span><h1>{title}<span className="heading-dot">.</span></h1><p>{kind === "savings" ? t("Record shares, follow contributions and see every member’s progress.", "Andika imigabane, ukurikirane imisanzu n’iterambere rya buri wese.") : kind === "social" ? t("A dedicated register for member social contributions and group support.", "Igitabo cy’imisanzu y’ingoboka n’ubufasha bw’ikimina.") : t("A dedicated register for paid penalties and their references.", "Igitabo cy’amande yishyuwe n’ibisobanuro byayo.")}</p></div><Action onClick={() => openRecord(kind)}><Plus size={17} />{recordLabel}</Action></div>

    <div className="member-stats">
      <Stat icon={kind === "savings" ? <Coins size={19} /> : kind === "social" ? <Heart size={19} /> : <ShieldCheck size={19} />} label={kind === "savings" ? t("Shares recorded", "Imigabane yanditswe") : kind === "social" ? t("Social collected", "Ingoboka yakiriwe") : t("Penalties collected", "Amande yakiriwe")} amount={kind === "savings" ? <>{money(stats.total / SHARE_VALUE)} <small>{t("shares", "imigabane")}</small></> : <Money amount={stats.total} />} note={t("Current filters", "Ibyo wahisemo")} />
      <Stat icon={kind === "savings" ? <Wallet size={19} /> : <Users size={19} />} tone="mint" label={kind === "savings" ? t("Contribution value", "Agaciro k’imisanzu") : t("Contributors", "Abatanze")} amount={kind === "savings" ? <Money amount={stats.total} /> : stats.contributors} note={t("Current filters", "Ibyo wahisemo")} />
      <Stat icon={kind === "social" ? <Heart size={19} /> : <History size={19} />} tone="violet" label={kind === "social" ? t("Available social fund", "Ingoboka isigaye") : kind === "savings" ? t("Contributors", "Abatanze") : t("Payment records", "Inyandiko z’ubwishyu")} amount={kind === "social" ? <Money amount={data.kindTotal - data.supportTotal} /> : kind === "savings" ? stats.contributors : stats.count} note={kind === "social" ? t("All collections less recorded support", "Ingoboka yose ukuyemo ubufasha bwanditswe") : t("Current filters", "Ibyo wahisemo")} />
    </div>

    <section className={`panel contribution-register ${url.pending ? "is-loading" : ""}`}>
      <div className="filter-bar"><SearchBox value={data.q} onSearch={q => url.set({ q })} label={t("Search this register", "Shaka muri iki gitabo")} placeholder={tab === "payments" ? t("Search member, code or reference…", "Shaka umunyamuryango, inomero cyangwa ibisobanuro…") : t("Search member name, code or district…", "Shaka izina, inomero cyangwa akarere…")} />{tab !== "sheet" && <Choice size="sm" className="filter-choice" ariaLabel={t("Register month", "Ukwezi kw’igitabo")} value={period} onChange={value => url.set({ period: value })} options={[{ value: "all", label: t("All months", "Amezi yose") }, ...data.months.map(month => ({ value: month, label: dateLabel(month, true) }))]} />}</div>
      <div className="history-toolbar"><div className="segmented" aria-label={t("Register display", "Uko igitabo kigaragara")}>{tabs.map(([value, label, Icon]) => <button key={value} aria-pressed={tab === value} onClick={() => url.set({ tab: value === "payments" ? null : value })}><Icon size={15} />{label}{value === "payments" && <span>{stats.count}</span>}</button>)}</div><ReportDownloads {...download} /></div>

      {data.payments ? <>
        <ActivityList records={data.payments.rows} showMember onSelect={record => openReceipt(record.id)} />
        <Pager page={data.payments} pending={url.pending} onPage={setPage} noun={t("payments", "ubwishyu")} />
      </> : data.summary ? data.summary.rows.length ? <><div className="table-wrap"><table className="record-table register-member-table"><thead><tr><th>{t("Member", "Umunyamuryango")}</th><th>{kind === "savings" ? t("Shares", "Imigabane") : t("Payments", "Ubwishyu")}</th><th>{t("Recorded value", "Amafaranga yanditswe")}</th>{kind !== "penalty" && <th>{t("Commitment", "Umusanzu usabwa")}</th>}<th>{t("Record", "Andika")}</th></tr></thead><tbody>{data.summary.rows.map(({ member, paid, count }) => {
        const expected = commitment(member);
        const complete = expected > 0 && paid >= expected;
        return <tr key={member.id}><td data-label={t("Member", "Umunyamuryango")}><span className="member-link"><MemberCode code={member.id} /><span><strong>{member.name}</strong>{member.status === "former" && <small>{t("Former member", "Yahoze ari umunyamuryango")}</small>}</span></span></td><td data-label={kind === "savings" ? t("Shares", "Imigabane") : t("Payments", "Ubwishyu")}>{kind === "savings" ? money(paid / SHARE_VALUE) : count}</td><td data-label={t("Recorded value", "Amafaranga yanditswe")}><b>{money(paid)} RWF</b></td>{kind !== "penalty" && <td data-label={t("Commitment", "Umusanzu usabwa")}>{period === "all" ? <span className="muted">{t("Select a month", "Hitamo ukwezi")}</span> : !expected ? <span className="muted">{t("Not set", "Ntibirashyirwaho")}</span> : <><span className={`status-pill ${complete ? "" : "amber"}`}>{complete ? t("Met", "Byuzuye") : paid ? t("Partial", "Igice") : t("Outstanding", "Ntaratanga")}</span>{!complete && <small>{money(expected - paid)} RWF {t("remaining", "asigaye")}</small>}</>}</td>}<td className="table-action"><button className="register-record-action" onClick={() => openRecord(kind, member.id)} aria-label={`${recordLabel}: ${member.name}`}><Plus size={15} />{t("Record", "Andika")}</button></td></tr>;
      })}</tbody></table></div><Pager page={data.summary} pending={url.pending} onPage={setPage} noun={t("members", "abanyamuryango")} /></> : <EmptyState text={t("No members found", "Nta munyamuryango wabonetse")} />
      : data.sheet ? <RegisterSheet kind={kind} sheet={data.sheet} pending={url.pending} onYear={year => url.set({ year: year === "all" ? null : year })} onPage={setPage} /> : null}
    </section>

    {kind === "social" && <section className="panel social-support-panel"><SectionHeading title={t("Support from our circle", "Ubufasha bw’ikimina")} subtitle={t("Cashbook payments marked as social support.", "Ibyishyuwe mu gitabo cy’imari byashyizwe mu bufasha.")} />{data.support.length ? data.support.map(entry => <div key={entry.id} className="support-row"><span className="stat-icon mint"><Heart size={18} /></span><div><strong>{entry.description}</strong><span>{entry.date ? dateLabel(entry.date) : entry.dateText || t("Date not recorded", "Itariki ntiyanditswe")}</span></div><b><Money amount={entry.moneyOut} /></b></div>) : <EmptyState text={t("No support payments recorded yet", "Nta bufasha buranditswe")} detail={t("Mark cashbook payments with the Social support category to list them here.", "Shyira ibyishyuwe mu gitabo cy’imari mu cyiciro cy’ubufasha kugira ngo bigaragare hano.")} />}</section>}
    <p className="below-note">{kind === "savings" ? t("Shares are recorded at 5,000 RWF each. Only savings shares increase the member’s savings principal.", "Imigabane yandikwa ku gaciro ka 5,000 RWF buri umwe. Imigabane y’ubwizigame ni yo yongera ubwizigame bw’umunyamuryango.") : kind === "social" ? t("Social contributions are separate from personal savings and allocated interest.", "Imisanzu y’ingoboka itandukanye n’ubwizigame bwite n’inyungu zagenewe.") : t("These are paid penalties. The imported penalty register ends in December 2024; later penalties appear here once recorded.", "Aya ni amande yishyuwe. Igitabo cy’amande cyinjijwe kirangira mu Ukuboza 2024; amande yakurikiyeho agaragara hano iyo yanditswe.")}</p>
    <button className="text-action register-top-action" onClick={() => openRecord(kind)}>{recordLabel}<ArrowUpRight size={16} /></button>
  </>;
}
