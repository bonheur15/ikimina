"use client";

import { BrandLoader } from "@/components/brand-loader";

import { createContext, useContext, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Coins, Download, FileSpreadsheet, Heart, MinusCircle, Search, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHARE_VALUE, balanceSeries, currentPeriod, money, monthsBack, recordShares, savingsBalance, type Member, type MemberRecord, type RecordKind } from "@/lib/portal-data";
import type { MonthlyAmount } from "@/lib/admin-types";
import { voidRecord } from "@/app/actions/portal";
import { getRecordDetail, type RecordDetailData } from "@/app/actions/lookup";
import { Choice } from "./ui/choice";

export type Translate = (en: string, rw: string) => string;
export const LanguageContext = createContext<Translate>(en => en);
export const useT = () => useContext(LanguageContext);
export function Brand() {
  return <span className="brand"><Image src="/images/elayo/logo.png" alt="Elayo Family" width={3375} height={1233} unoptimized className="brand-logo" /></span>;
}
export function Avatar({ member, small = false }: { member: Member; small?: boolean }) {
  return <span aria-hidden="true" className={`avatar ${member.color} ${small ? "small" : ""}`}>{member.initials}</span>;
}
/** Member code shown in lists in place of an avatar. */
export function MemberCode({ code }: { code: string }) {
  return <span className="member-code">{code}</span>;
}
export function Action({ children, onClick, secondary = false, className = "", type = "button", disabled = false, busy = false }: {
  children: ReactNode; onClick?: () => void; secondary?: boolean; className?: string;
  type?: "button" | "submit"; disabled?: boolean; busy?: boolean;
}) {
  const t = useT();
  return <button type={type} className={`action ${secondary ? "secondary" : ""} ${className}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>{busy && <BrandLoader size="inline" label={t("Loading…", "Tegereza gato…")} />}{children}</button>;
}
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
export function Money({ amount, unit = true }: { amount: number; unit?: boolean }) {
  return <span className="money">{money(amount)}{unit && <small>RWF</small>}</span>;
}
/** "1 share" / "5 shares" in the current language. */
export function useSharesLabel() {
  const t = useT();
  return (count: number) => `${money(count)} ${count === 1 ? t("share", "umugabane") : t("shares", "imigabane")}`;
}
export const signed = (amount: number) => `${amount < 0 ? "−" : "+"}${money(Math.abs(amount))}`;
export function Stat({ icon, label, amount, note, tone = "blue" }: { icon: ReactNode; label: string; amount: ReactNode; note?: string; tone?: string }) {
  return <div className="stat"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong>{amount}</strong>{note && <span className="stat-note">{note}</span>}</div>;
}
export function KindIcon({ kind }: { kind: RecordKind | string }) {
  return <span className={`kind-icon ${kind}`}>{kind === "savings" ? <ArrowDownLeft size={19} /> : kind === "social" ? <Heart size={17} /> : kind === "interest" ? <Sparkles size={18} /> : kind === "adjustment" ? <MinusCircle size={18} /> : <ShieldCheck size={18} />}</span>;
}
export function KindLabel({ kind, amount = 0 }: { kind: RecordKind | string; amount?: number }) {
  const t = useT();
  return <>{kind === "savings" ? t("Savings contribution", "Umusanzu w’ubwizigame") : kind === "social" ? t("Social fund contribution", "Umusanzu w’ingoboka") : kind === "interest" ? t("Interest allocation", "Inyungu zagenewe") : kind === "adjustment" ? (amount < 0 ? t("Withdrawal or deduction", "Ayakuweho") : t("Savings correction", "Ikosora ry’ubwizigame")) : t("Penalty payment", "Ubwishyu bw’amande")}</>;
}
export function useDateLabel() {
  const t = useT();
  return (date: string, monthOnly = false) => new Intl.DateTimeFormat(t("en-GB", "rw-RW"), {
    ...(monthOnly ? {} : { day: "numeric" as const }), month: "short", year: "numeric", timeZone: "Africa/Kigali",
  }).format(new Date(`${date.length === 7 ? `${date}-01` : date}T12:00:00+02:00`));
}
/** When a record happened, as precisely as the source allows. */
export function useRecordWhen() {
  const t = useT();
  const dateLabel = useDateLabel();
  return (record: MemberRecord) => record.date ? `${dateLabel(record.date)}${record.time ? ` · ${record.time}` : ""}`
    : record.period ? dateLabel(record.period, true) : t("Date not recorded", "Itariki ntiyanditswe");
}
/** Records list. With `showMember`, each row starts with the member code and name (records carry memberName). */
export function ActivityList({ records, onSelect, showMember = false, limit }: { records: MemberRecord[]; onSelect: (r: MemberRecord) => void; showMember?: boolean; limit?: number }) {
  const when = useRecordWhen();
  const t = useT();
  const sharesLabel = useSharesLabel();
  const shown = limit ? records.slice(0, limit) : records;
  if (!shown.length) return <EmptyState text={t("No contributions found", "Nta misanzu yabonetse")} detail={t("Try another month, type or search.", "Hindura ukwezi, ubwoko cyangwa ibyo ushakisha.")} />;
  return <div className="activity-list">{shown.map(record => {
    const name = showMember ? record.memberName || record.memberId : "";
    return <button className="activity-row" key={record.id} onClick={() => onSelect(record)}>
      {showMember ? <MemberCode code={record.memberId} /> : <KindIcon kind={record.type} />}
      <span className="activity-copy"><strong>{name || <KindLabel kind={record.type} amount={record.amount} />}</strong><span>{name ? <><KindLabel kind={record.type} amount={record.amount} /> · </> : null}{record.type === "savings" && <><b className="activity-shares">{sharesLabel(recordShares(record))}</b> · </>}{when(record)}{record.method && <span className="activity-method"> · {record.method}</span>}</span></span>
      <span className="activity-amount">{signed(record.amount)}<small>RWF</small></span><ChevronRight className="activity-chevron" size={16} />
    </button>;
  })}</div>;
}
export function EmptyState({ text, detail }: { text: string; detail?: string }) {
  return <div className="empty-state"><Search size={26} /><h3>{text}</h3>{detail && <p>{detail}</p>}</div>;
}
/** Savings balance over time from monthly net amounts (see monthlyNet / savingsSeries). */
export function BalanceChart({ monthly, group = false }: { monthly: MonthlyAmount[]; group?: boolean }) {
  const t = useT();
  const id = useId().replaceAll(":", "");
  const [range, setRange] = useState("12");
  const latest = monthly.reduce((max, r) => r.period > max ? r.period : max, "");
  const end = latest && latest > currentPeriod() ? latest : currentPeriod();
  const first = monthly.reduce((min, r) => r.period && r.period < min ? r.period : min, end);
  const span = (Number(end.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(end.slice(5)) - Number(first.slice(5)) + 1;
  const months = monthsBack(range === "all" ? Math.max(span, 2) : Number(range), end);
  const series = balanceSeries(monthly, months);
  const max = Math.max(...series, 1) * 1.04;
  const min = Math.max(0, Math.min(...series) * .9);
  const y = (n: number) => 145 - (n - min) / (max - min || 1) * 125;
  const points = series.map((n, i) => `${i * 600 / (series.length - 1)},${y(n)}`).join(" ");
  const last = series.at(-1) ?? 0;
  const step = Math.ceil(months.length / 7);
  const label = (m: string) => new Intl.DateTimeFormat(t("en", "rw"), { month: "short", ...(months.length > 12 ? { year: "2-digit" as const } : {}) }).format(new Date(`${m}-15T12:00:00Z`));
  const shown = months.filter((_, i) => (months.length - 1 - i) % step === 0);
  const scale = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : `${Math.round(n / 1000)}K`;
  return <section className="panel growth-panel"><SectionHeading title={t(group ? "Savings over time" : "Your savings journey", group ? "Ubwizigame uko igihe kigenda" : "Amateka y’ubwizigame bwawe")} subtitle={t("A little progress, every month.", "Iterambere buri kwezi.")} action={<Choice size="sm" ariaLabel={t("Chart period", "Igihe cy’imbonerahamwe")} value={range} onChange={setRange} options={[{ value: "12", label: t("Last 12 months", "Amezi 12 ashize") }, { value: "36", label: t("Last 3 years", "Imyaka 3 ishize") }, { value: "all", label: t("Since the start", "Kuva byatangira") }]} />} />
    <div className="chart-headline"><strong><Money amount={last} /></strong><span className="positive"><ArrowUpRight size={14} />{signed(last - series[0])} {t("over this period", "muri iki gihe")}</span></div>
    <div className="chart-body"><div className="chart-scale">{[max, (max + min) / 2, min].map((n, i) => <span key={i}>{scale(n)}</span>)}</div><div className="chart-drawing"><svg viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label={`${t("Savings", "Ubwizigame")}: ${months.map((m, i) => `${label(m)} ${money(series[i])} RWF`).join(", ")}`}><defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2e72e0" stopOpacity=".22" /><stop offset="100%" stopColor="#2e72e0" stopOpacity="0" /></linearGradient></defs>{[20, 82, 145].map(n => <line key={n} x1="0" y1={n} x2="600" y2={n} stroke="#e6ebf1" strokeDasharray="3 5" />)}<polygon points={`0,170 ${points} 600,170`} fill={`url(#fill-${id})`} /><polyline points={points} fill="none" stroke="#0057d9" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" /><circle cx="600" cy={y(last)} r="4" fill="#0057d9" /></svg><div className="chart-months">{shown.map(m => <span key={m}>{label(m)}</span>)}</div></div></div>
    <div className="chart-caption"><span><i />{t(group ? "Group savings balance" : "Savings balance", group ? "Ubwizigame bw’ikimina" : "Ubwizigame busigaye")}</span><span>{label(months[0])} – {label(end)} · RWF</span></div>
  </section>;
}
/** Details of one record, loaded from the server by reference (members can only open their own). */
export function RecordDetail({ reference, admin = false, onChanged, onClose }: {
  reference: string | null; admin?: boolean; onChanged?: () => void; onClose: () => void;
}) {
  const t = useT();
  const dateLabel = useDateLabel();
  const [detail, setDetail] = useState<RecordDetailData | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!reference) return;
    let active = true;
    getRecordDetail(reference).then(result => { if (active) { setDetail(result); setLoaded(reference); } });
    return () => { active = false; };
  }, [reference]);
  const close = () => { setRemoving(false); setReason(""); setError(""); setDetail(null); setLoaded(null); onClose(); };
  const remove = () => start(async () => {
    const result = await voidRecord(reference!, reason);
    if (!result.ok) { setError(result.error); return; }
    onChanged?.(); close();
  });
  const record = loaded === reference ? detail?.record : undefined;
  return <Dialog open={!!reference} onOpenChange={open => !open && close()}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{t("Record details", "Amakuru y’inyandiko")}</DialogTitle><DialogDescription>{t("Everything recorded about this entry.", "Ibyanditswe byose kuri iyi nyandiko.")}</DialogDescription></DialogHeader>
    {loaded !== reference ? <div className="dialog-loading"><BrandLoader label={t("Loading…", "Tegereza gato…")} /></div> : !record || !detail ? <EmptyState text={t("This record is no longer available", "Iyi nyandiko ntikiboneka")} /> : <><div className="receipt-hero"><KindIcon kind={record.type} /><span><KindLabel kind={record.type} amount={record.amount} /></span><strong><Money amount={record.amount} /></strong><span className="status-pill"><Check size={13} />{record.source === "import" ? t("From the registers", "Kuva mu bitabo") : t("Recorded", "Byanditswe")}</span></div><dl className="detail-list"><div><dt>{t("Member", "Umunyamuryango")}</dt><dd>{detail.member.name} · <span className="mono">{detail.member.id}</span></dd></div>{record.type === "savings" && <div><dt>{t("Shares", "Imigabane")}</dt><dd>{money(recordShares(record))} × {money(SHARE_VALUE)} RWF</dd></div>}<div><dt>{t("Reference", "Inomero")}</dt><dd className="mono">{record.id}</dd></div>{record.period && <div><dt>{t("Contribution month", "Ukwezi k’umusanzu")}</dt><dd>{dateLabel(record.period, true)}</dd></div>}<div><dt>{t("Payment date", "Itariki y’ubwishyu")}</dt><dd>{record.date ? `${dateLabel(record.date)}${record.time ? ` · ${record.time} CAT` : ""}` : t("Not recorded in the monthly register", "Ntiyanditswe mu gitabo cya buri kwezi")}</dd></div>{record.method && <div><dt>{t("Method", "Uburyo")}</dt><dd>{record.method}</dd></div>}{detail.balanceAfter != null && <div><dt>{t("Savings after this record", "Ubwizigame nyuma y’iyi nyandiko")}</dt><dd>{money(detail.balanceAfter)} RWF</dd></div>}{record.sourceRef && <div><dt>{t("Source", "Aho byavuye")}</dt><dd><FileSpreadsheet size={13} /> {record.sourceRef}</dd></div>}</dl>{record.note && <p className="receipt-note">{record.note}</p>}
    {admin && record.source === "manual" && (removing ? <div className="portal-form void-form"><label className="field">{t("Why is this record being removed?", "Kuki iyi nyandiko ikurwaho?")}<input value={reason} maxLength={300} onChange={e => { setReason(e.target.value); setError(""); }} placeholder={t("For example, entered for the wrong member", "Urugero: yanditswe ku munyamuryango utari we")} autoFocus /></label>{error && <p role="alert" className="form-error">{error}</p>}<div className="record-success-actions"><Action secondary onClick={() => setRemoving(false)}>{t("Keep record", "Yigumishe")}</Action><Action className="danger" onClick={remove} busy={pending}><Trash2 size={15} />{t("Remove record", "Kuraho")}</Action></div></div> : <button className="text-action danger-text" onClick={() => setRemoving(true)}><Trash2 size={14} />{t("Remove this record", "Kuraho iyi nyandiko")}</button>)}</>}</DialogContent></Dialog>;
}
export function SavingsBreakdown({ member, records }: { member: Member; records: MemberRecord[] }) {
  const t = useT();
  const adjustments = records.reduce((s, r) => r.type === "adjustment" ? s + r.amount : s, 0);
  return <section className="panel breakdown-panel"><SectionHeading title={t("Every franc, accounted for", "Buri faranga rirabarwa")} subtitle={t("A clear view of your account.", "Amakuru ya konti yawe asobanutse.")} /><div className="breakdown-row"><span className="stat-icon blue"><Coins size={18} /></span><div><strong>{t("Savings principal", "Ubwizigame shingiro")}</strong><span>{adjustments ? t(`Contributions less ${money(Math.abs(adjustments))} RWF withdrawn`, `Imisanzu ukuyemo ${money(Math.abs(adjustments))} RWF yakuweho`) : t("Your own contributions", "Imisanzu yawe")}</span></div><b>{money(savingsBalance(records))}<small>RWF</small></b></div><div className="breakdown-row"><span className="stat-icon violet"><Sparkles size={18} /></span><div><strong>{t("Interest allocated", "Inyungu zagenewe")}</strong><span>{t("All years · Shown separately", "Imyaka yose · Zigaragazwa ukwazo")}</span></div><b>{money(member.interest)}<small>RWF</small></b></div><div className="breakdown-foot"><ShieldCheck size={17} /><p>{t("Social contributions support the group fund and are separate from your savings.", "Imisanzu y’ingoboka ijya mu kigega cy’ikimina kandi itandukanye n’ubwizigame bwawe.")}</p></div></section>;
}
export function DownloadButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT();
  return <Action secondary onClick={onClick}><Download size={16} />{label ?? t("Download CSV", "Kuramo CSV")}</Action>;
}
