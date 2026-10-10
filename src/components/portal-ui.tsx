"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Coins, Download, Heart, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHARE_VALUE, money, recordShares, runningBalance, savingsBalance, type Member, type MemberRecord } from "@/lib/portal-data";

export type Translate = (en: string, rw: string) => string;
export const LanguageContext = createContext<Translate>(en => en);
export const useT = () => useContext(LanguageContext);
export function Brand() {
  return <span className="brand"><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 30 30"><path d="M7 7v9c0 5 4 8 9 8M14 5v9c0 4 3 7 7 7M21 4v8c0 3 2 5 5 5" /></svg></span>ikimina<span className="brand-dot">.</span></span>;
}
export function Avatar({ member, small = false }: { member: Member; small?: boolean }) {
  return <span aria-hidden="true" className={`avatar ${member.color} ${small ? "small" : ""}`}>{member.initials}</span>;
}
export function Action({ children, onClick, secondary = false, className = "", type = "button", disabled = false }: {
  children: ReactNode; onClick?: () => void; secondary?: boolean; className?: string;
  type?: "button" | "submit"; disabled?: boolean;
}) {
  return <button type={type} className={`action ${secondary ? "secondary" : ""} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
export function Money({ amount, unit = true }: { amount: number; unit?: boolean }) {
  return <span className="money">{money(amount)}{unit && <small>RWF</small>}</span>;
}
export function Stat({ icon, label, amount, note, tone = "blue" }: { icon: ReactNode; label: string; amount: ReactNode; note?: string; tone?: string }) {
  return <div className="stat"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><strong>{amount}</strong>{note && <span className="stat-note">{note}</span>}</div>;
}
export function KindIcon({ kind }: { kind: string }) {
  return <span className={`kind-icon ${kind}`}>{kind === "savings" ? <ArrowDownLeft size={19} /> : kind === "social" ? <Heart size={17} /> : kind === "interest" ? <Sparkles size={18} /> : <ShieldCheck size={18} />}</span>;
}
export function KindLabel({ kind }: { kind: string }) {
  const t = useT();
  return <>{kind === "savings" ? t("Savings contribution", "Umusanzu w’ubwizigame") : kind === "social" ? t("Social fund contribution", "Umusanzu w’ingoboka") : t("Penalty payment", "Ubwishyu bw’amande")}</>;
}
export function useDateLabel() {
  const t = useT();
  return (date: string, monthOnly = false) => new Intl.DateTimeFormat(t("en-GB", "rw-RW"), {
    ...(monthOnly ? {} : { day: "numeric" as const }), month: "short", year: "numeric", timeZone: "Africa/Kigali",
  }).format(new Date(`${date.length === 7 ? `${date}-01` : date}T12:00:00+02:00`));
}
export function ActivityList({ records, onSelect, people, limit }: { records: MemberRecord[]; onSelect: (r: MemberRecord) => void; people?: Member[]; limit?: number }) {
  const dateLabel = useDateLabel();
  const t = useT();
  const shown = limit ? records.slice(0, limit) : records;
  if (!shown.length) return <EmptyState text={t("No contributions found", "Nta misanzu yabonetse")} detail={t("Try another month, type or search.", "Hindura ukwezi, ubwoko cyangwa ibyo ushakisha.")} />;
  return <div className="activity-list">{shown.map(record => {
    const member = people?.find(m => m.id === record.memberId);
    return <button className="activity-row" key={record.id} onClick={() => onSelect(record)}>
      {member ? <Avatar member={member} small /> : <KindIcon kind={record.type} />}
      <span className="activity-copy"><strong>{member ? member.name : <KindLabel kind={record.type} />}</strong><span>{member ? <><KindLabel kind={record.type} /> · </> : null}{record.type === "savings" && <><b className="activity-shares">{money(recordShares(record))} {t("shares", "imigabane")}</b> · </>}{dateLabel(record.date)}<span className="activity-method"> · {record.method}</span></span></span>
      <span className="activity-amount">+{money(record.amount)}<small>RWF</small></span><ChevronRight className="activity-chevron" size={16} />
    </button>;
  })}</div>;
}
export function EmptyState({ text, detail }: { text: string; detail?: string }) {
  return <div className="empty-state"><Search size={26} /><h3>{text}</h3>{detail && <p>{detail}</p>}</div>;
}
export function BalanceChart({ member, records, group = false }: { member: Member; records: MemberRecord[]; group?: boolean }) {
  const t = useT();
  const id = useId().replaceAll(":", "");
  const [period, setPeriod] = useState("6");
  const months = Array.from({ length: period === "6" ? 6 : 10 }, (_, i) => i + (period === "6" ? 5 : 1));
  const series = months.map(month => {
    const cutoff = `2026-${String(month).padStart(2, "0")}`;
    return (group ? 0 : member.openingSavings) + records.filter(r => r.type === "savings" && r.date.slice(0, 7) <= cutoff).reduce((s, r) => s + r.amount, 0);
  });
  const max = Math.max(...series, 1) * 1.04;
  const min = Math.max(0, Math.min(...series) * .9);
  const y = (n: number) => 145 - (n - min) / (max - min) * 125;
  const points = series.map((n, i) => `${i * 600 / (series.length - 1)},${y(n)}`).join(" ");
  const last = series.at(-1) ?? 0;
  const monthLabels = months.map(m => new Intl.DateTimeFormat(t("en", "rw"), { month: "short" }).format(new Date(2026, m - 1, 1)));
  return <section className="panel growth-panel"><SectionHeading title={t(group ? "Contributions over time" : "Your savings journey", group ? "Imisanzu uko igihe kigenda" : "Amateka y’ubwizigame bwawe")} subtitle={t("A little progress, every month.", "Iterambere buri kwezi.")} action={<select className="compact-select" aria-label={t("Chart period", "Igihe cy’imbonerahamwe")} value={period} onChange={e => setPeriod(e.target.value)}><option value="6">{t("Last 6 months", "Amezi 6 ashize")}</option><option value="10">2026</option></select>} />
    <div className="chart-headline"><strong><Money amount={last} /></strong><span className="positive"><ArrowUpRight size={14} />+{money(last - series[0])} {t("over this period", "muri iki gihe")}</span></div>
    <div className="chart-body"><div className="chart-scale">{[max, (max + min) / 2, min].map((n, i) => <span key={i}>{(n / 1000000).toFixed(2)}M</span>)}</div><div className="chart-drawing"><svg viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label={`${t("Savings", "Ubwizigame")}: ${monthLabels.map((m, i) => `${m} ${money(series[i])} RWF`).join(", ")}`}><defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4386eb" stopOpacity=".22" /><stop offset="100%" stopColor="#4386eb" stopOpacity="0" /></linearGradient></defs>{[20, 82, 145].map(n => <line key={n} x1="0" y1={n} x2="600" y2={n} stroke="#e6ebf1" strokeDasharray="3 5" />)}<polygon points={`0,170 ${points} 600,170`} fill={`url(#fill-${id})`} /><polyline points={points} fill="none" stroke="#3978da" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" /><circle cx="600" cy={y(last)} r="4" fill="#3978da" /></svg><div className="chart-months">{monthLabels.map((m, i) => <span key={i}>{m}</span>)}</div></div></div>
    <div className="chart-caption"><span><i />{t(group ? "Cumulative contributions" : "Savings balance", group ? "Imisanzu yose" : "Ubwizigame busigaye")}</span><span>2026 · RWF</span></div>
  </section>;
}
export function RecordDetail({ record, member, records, onClose }: { record: MemberRecord | null; member: Member; records: MemberRecord[]; onClose: () => void }) {
  const t = useT();
  const dateLabel = useDateLabel();
  return <Dialog open={!!record} onOpenChange={open => !open && onClose()}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{t("Contribution details", "Amakuru y’umusanzu")}</DialogTitle><DialogDescription>{t("A complete record of this sample contribution.", "Amakuru yose y’uyu musanzu w’icyitegererezo.")}</DialogDescription></DialogHeader>{record && <><div className="receipt-hero"><KindIcon kind={record.type} /><span><KindLabel kind={record.type} /></span><strong><Money amount={record.amount} /></strong><span className="status-pill"><Check size={13} />{t("Recorded", "Byanditswe")}</span></div><dl className="detail-list"><div><dt>{t("Member", "Umunyamuryango")}</dt><dd>{member.name}</dd></div>{record.type === "savings" && <div><dt>{t("Shares recorded", "Imigabane yanditswe")}</dt><dd>{money(recordShares(record))} × {money(SHARE_VALUE)} RWF</dd></div>}<div><dt>{t("Reference", "Inomero")}</dt><dd className="mono">{record.id}</dd></div><div><dt>{t("Payment date", "Itariki y’ubwishyu")}</dt><dd>{dateLabel(record.date)} · {record.time} CAT</dd></div><div><dt>{t("Contribution month", "Ukwezi k’umusanzu")}</dt><dd>{dateLabel(record.period, true)}</dd></div><div><dt>{t("Method", "Uburyo")}</dt><dd>{record.method}</dd></div><div><dt>{t("Savings after payment", "Ubwizigame nyuma y’ubwishyu")}</dt><dd>{money(runningBalance(member, records, record))} RWF</dd></div></dl><p className="receipt-note">{record.note}</p></>}</DialogContent></Dialog>;
}
export function SavingsBreakdown({ member, records }: { member: Member; records: MemberRecord[] }) {
  const t = useT();
  return <section className="panel breakdown-panel"><SectionHeading title={t("Every franc, accounted for", "Buri faranga rirabarwa")} subtitle={t("A clear view of your account.", "Amakuru ya konti yawe asobanutse.")} /><div className="breakdown-row"><span className="stat-icon blue"><Coins size={18} /></span><div><strong>{t("Savings principal", "Ubwizigame shingiro")}</strong><span>{t("Your own contributions", "Imisanzu yawe")}</span></div><b>{money(savingsBalance(member, records))}<small>RWF</small></b></div><div className="breakdown-row"><span className="stat-icon violet"><Sparkles size={18} /></span><div><strong>{t("Interest allocated", "Inyungu zagenewe")}</strong><span>{t("2025 · Shown separately", "2025 · Zigaragazwa ukwazo")}</span></div><b>{money(member.interest)}<small>RWF</small></b></div><div className="breakdown-foot"><ShieldCheck size={17} /><p>{t("Social contributions support the group fund and are separate from your savings.", "Imisanzu y’ingoboka ijya mu kigega cy’ikimina kandi itandukanye n’ubwizigame bwawe.")}</p></div></section>;
}
export function DownloadButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT();
  return <Action secondary onClick={onClick}><Download size={16} />{label ?? t("Download CSV", "Kuramo CSV")}</Action>;
}
