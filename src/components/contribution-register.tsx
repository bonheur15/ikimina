"use client";

import { useState } from "react";
import { ArrowUpRight, Coins, Heart, History, Plus, Search, ShieldCheck, Users, Wallet } from "lucide-react";
import { CURRENT_PERIOD, SHARE_VALUE, downloadCsv, expenses, exportRecords, memberRecords, money, recordShares, sumRecords, type ContributionKind, type Member, type MemberRecord } from "@/lib/portal-data";
import { Action, ActivityList, Avatar, DownloadButton, EmptyState, Money, SectionHeading, Stat, useDateLabel, useT } from "./portal-ui";
import { IllustratedIntro } from "./portal-illustrations";

export function ContributionRegister({ kind, people, records, onRecord, onSelect }: {
  kind: ContributionKind; people: Member[]; records: MemberRecord[];
  onRecord: (kind: ContributionKind, memberId?: string) => void; onSelect: (record: MemberRecord) => void;
}) {
  const t = useT();
  const dateLabel = useDateLabel();
  const [period, setPeriod] = useState(kind === "penalty" ? "all" : CURRENT_PERIOD);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("payments");
  const [limit, setLimit] = useState(20);
  const ownRecords = records.filter(record => record.type === kind);
  const periodRecords = ownRecords.filter(record => period === "all" || record.period === period);
  const search = query.trim().toLowerCase();
  const matchesMember = (member: Member) => `${member.name} ${member.id} ${member.district}`.toLowerCase().includes(search);
  const filtered = periodRecords.filter(record => {
    const member = people.find(person => person.id === record.memberId);
    return `${member?.name} ${member?.district} ${record.memberId} ${record.id} ${record.note} ${record.method}`.toLowerCase().includes(search);
  });
  const total = sumRecords(filtered);
  const contributors = new Set(filtered.map(record => record.memberId)).size;
  const months = [...new Set([CURRENT_PERIOD, ...ownRecords.map(record => record.period)])].sort().reverse();
  const support = expenses.filter(expense => expense.category === "Social support");
  const supportPaid = support.reduce((sum, expense) => sum + expense.amount, 0);
  const title = kind === "savings" ? t("Savings contributions", "Imisanzu y’ubwizigame") : kind === "social" ? t("Social fund", "Ikigega cy’ingoboka") : t("Penalty payments", "Ubwishyu bw’amande");
  const recordLabel = kind === "savings" ? t("Record shares", "Andika imigabane") : kind === "social" ? t("Record social contribution", "Andika umusanzu w’ingoboka") : t("Record penalty payment", "Andika ubwishyu bw’amande");
  const resetFilters = () => { setQuery(""); setPeriod("all"); setLimit(20); };
  const matchingPeople = people.filter(matchesMember);
  const exportRegister = () => {
    if (mode === "payments") { exportRecords(filtered, `sample-${kind}-register.csv`); return; }
    const rows: (string | number)[][] = [
      [`Sample ${kind} member summary`, period],
      ["Member code", "Member name", kind === "savings" ? "Shares" : "Payment count", "Recorded value (RWF)", ...(kind === "penalty" ? [] : ["Monthly commitment (RWF)", "Remaining for selected month (RWF)"])],
      ...matchingPeople.map(member => {
        const payments = memberRecords(periodRecords, member.id);
        const paid = sumRecords(payments);
        const expected = kind === "savings" ? member.monthlySavings : 5000;
        return [member.id, member.name, kind === "savings" ? payments.reduce((sum, record) => sum + recordShares(record), 0) : payments.length, paid, ...(kind === "penalty" ? [] : [expected, period === "all" ? "" : Math.max(0, expected - paid)])];
      }),
    ];
    downloadCsv(`sample-${kind}-member-summary.csv`, rows);
  };

  return <>
    <div className="page-heading"><div><span className="eyebrow">{t("GROUP WORKSPACE", "URUBUGA RW’IKIMINA")}</span><h1>{title}<span className="heading-dot">.</span></h1><p>{kind === "savings" ? t("Record shares, follow contributions and see every member’s progress.", "Andika imigabane, ukurikirane imisanzu n’iterambere rya buri wese.") : kind === "social" ? t("A dedicated register for member social contributions and group support.", "Igitabo cy’imisanzu y’ingoboka n’ubufasha bw’ikimina.") : t("A dedicated register for paid penalties and their references.", "Igitabo cy’amande yishyuwe n’ibisobanuro byayo.")}</p></div><Action onClick={() => onRecord(kind)}><Plus size={17} />{recordLabel}</Action></div>

    <IllustratedIntro asset={kind === "savings" ? "savings" : kind === "social" ? "community" : "records"}
      title={kind === "savings" ? t("Savings, one share at a time.", "Ubwizigame, umugabane ku wundi.") : kind === "social" ? t("Care, backed by contributions.", "Ubufasha bukomoka ku misanzu.") : t("Clear records. Clear references.", "Inyandiko n’ibisobanuro bisobanutse.")}
      description={kind === "savings" ? t("1 share = 5,000 RWF. Enter the shares; the contribution value is calculated for you.", "Umugabane 1 = 5,000 RWF. Andika imigabane; agaciro kabarwa ako kanya.") : kind === "social" ? t("Every social contribution helps your circle be there for one another.", "Buri musanzu w’ingoboka ufasha abanyamuryango kwitaho bagenzi babo.") : t("Keep each payment tied to its member, date and penalty reason.", "Huza buri bwishyu n’umunyamuryango, itariki n’impamvu y’amande.")}
    />

    <div className="member-stats">
      <Stat icon={kind === "savings" ? <Coins size={19} /> : kind === "social" ? <Heart size={19} /> : <ShieldCheck size={19} />} label={kind === "savings" ? t("Shares recorded", "Imigabane yanditswe") : kind === "social" ? t("Social collected", "Ingoboka yakiriwe") : t("Penalties collected", "Amande yakiriwe")} amount={kind === "savings" ? <>{money(total / SHARE_VALUE)} <small>{t("shares", "imigabane")}</small></> : <Money amount={total} />} note={t("Current filters", "Ibyo wahisemo")} />
      <Stat icon={kind === "savings" ? <Wallet size={19} /> : <Users size={19} />} tone="mint" label={kind === "savings" ? t("Contribution value", "Agaciro k’imisanzu") : t("Contributors", "Abatanze")} amount={kind === "savings" ? <Money amount={total} /> : contributors} note={t("Current filters", "Ibyo wahisemo")} />
      <Stat icon={kind === "social" ? <Heart size={19} /> : <History size={19} />} tone="violet" label={kind === "social" ? t("Available social fund", "Ingoboka isigaye") : kind === "savings" ? t("Contributors", "Abatanze") : t("Payment records", "Inyandiko z’ubwishyu")} amount={kind === "social" ? <Money amount={sumRecords(ownRecords) - supportPaid} /> : kind === "savings" ? contributors : filtered.length} note={kind === "social" ? t("All 2026 collections less support", "Ingoboka ya 2026 ukuyemo ubufasha") : t("Current filters", "Ibyo wahisemo")} />
    </div>

    <section className="panel contribution-register">
      <div className="filter-bar"><label className="search-input"><Search size={17} /><input aria-label={t("Search this register", "Shaka muri iki gitabo")} placeholder={mode === "payments" ? t("Search member, code or reference…", "Shaka umunyamuryango, inomero cyangwa ibisobanuro…") : t("Search member name, code or district…", "Shaka izina, inomero cyangwa akarere…")} value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} /></label><select aria-label={t("Register month", "Ukwezi kw’igitabo")} value={period} onChange={event => { setPeriod(event.target.value); setLimit(20); }}><option value="all">{t("All months", "Amezi yose")}</option>{months.map(month => <option key={month} value={month}>{dateLabel(month, true)}</option>)}</select></div>
      <div className="history-toolbar"><div className="segmented" aria-label={t("Register display", "Uko igitabo kigaragara")}><button aria-pressed={mode === "payments"} onClick={() => setMode("payments")}>{t("Payments", "Ubwishyu")}<span>{filtered.length}</span></button><button aria-pressed={mode === "members"} onClick={() => setMode("members")}>{t("Member summary", "Incamake ya buri wese")}</button></div><DownloadButton onClick={exportRegister} /></div>

      {mode === "payments" ? <>
        <ActivityList records={filtered.slice(0, limit)} people={people} onSelect={onSelect} />
        {filtered.length > limit && <div className="empty-action"><Action secondary onClick={() => setLimit(limit + 20)}>{t("Load more payments", "Erekana ubundi bwishyu")}</Action></div>}
        {!filtered.length && <div className="empty-action"><Action secondary onClick={resetFilters}>{t("Clear filters", "Kuraho ibyo ushakisha")}</Action></div>}
      </> : matchingPeople.length ? <div className="table-wrap"><table className="record-table register-member-table"><thead><tr><th>{t("Member", "Umunyamuryango")}</th><th>{kind === "savings" ? t("Shares", "Imigabane") : t("Payments", "Ubwishyu")}</th><th>{t("Recorded value", "Amafaranga yanditswe")}</th>{kind !== "penalty" && <th>{t("Commitment", "Umusanzu usabwa")}</th>}<th>{t("Record", "Andika")}</th></tr></thead><tbody>{matchingPeople.map(member => {
        const payments = memberRecords(periodRecords, member.id);
        const paid = sumRecords(payments);
        const expected = kind === "savings" ? member.monthlySavings : 5000;
        const complete = paid >= expected;
        return <tr key={member.id}><td data-label={t("Member", "Umunyamuryango")}><span className="member-link"><Avatar member={member} small /><span><strong>{member.name}</strong><small>{member.id}</small></span></span></td><td data-label={kind === "savings" ? t("Shares", "Imigabane") : t("Payments", "Ubwishyu")}>{kind === "savings" ? money(payments.reduce((sum, record) => sum + recordShares(record), 0)) : payments.length}</td><td data-label={t("Recorded value", "Amafaranga yanditswe")}><b>{money(paid)} RWF</b></td>{kind !== "penalty" && <td data-label={t("Commitment", "Umusanzu usabwa")}>{period === "all" ? <span className="muted">{t("Select a month", "Hitamo ukwezi")}</span> : <><span className={`status-pill ${complete ? "" : "amber"}`}>{complete ? t("Met", "Byuzuye") : paid ? t("Partial", "Igice") : t("Outstanding", "Ntaratanga")}</span>{!complete && <small>{money(expected - paid)} RWF {t("remaining", "asigaye")}</small>}</>}</td>}<td className="table-action"><button className="register-record-action" onClick={() => onRecord(kind, member.id)} aria-label={`${recordLabel}: ${member.name}`}><Plus size={15} />{t("Record", "Andika")}</button></td></tr>;
      })}</tbody></table></div> : <EmptyState text={t("No members found", "Nta munyamuryango wabonetse")} />}
    </section>

    {kind === "social" && <section className="panel social-support-panel"><SectionHeading title={t("Support from our circle", "Ubufasha bw’ikimina")} subtitle={t("2026 sample support payments from the social fund.", "Ubufasha bw’icyitegererezo bwa 2026.")} />{support.map(expense => <div key={expense.id} className="support-row"><span className="stat-icon mint"><Heart size={18} /></span><div><strong>{expense.name}</strong><span>{dateLabel(expense.date)}</span></div><b><Money amount={expense.amount} /></b></div>)}</section>}
    <p className="below-note">{kind === "savings" ? t("Shares are recorded at 5,000 RWF each. Only savings shares increase the member’s savings principal.", "Imigabane yandikwa ku gaciro ka 5,000 RWF buri umwe. Imigabane y’ubwizigame ni yo yongera ubwizigame bw’umunyamuryango.") : kind === "social" ? t("Social contributions are separate from personal savings and allocated interest.", "Imisanzu y’ingoboka itandukanye n’ubwizigame bwite n’inyungu zagenewe.") : t("These are paid penalties. Unpaid or partially settled penalties require a separate assessment register.", "Aya ni amande yishyuwe. Atarishyuwe cyangwa ayishyuwe igice akenera igitabo cy’amande yaciwe.")}</p>
    <button className="text-action register-top-action" onClick={() => onRecord(kind)}>{recordLabel}<ArrowUpRight size={16} /></button>
  </>;
}
