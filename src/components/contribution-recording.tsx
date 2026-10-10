"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, Coins, Plus, Search, Users } from "lucide-react";
import { CURRENT_PERIOD, SHARE_VALUE, money, type ContributionKind, type Member, type MemberRecord } from "@/lib/portal-data";
import { Action, Avatar, useT } from "./portal-ui";

function MemberPicker({ people, value, onChange }: {
  people: Member[]; value: string; onChange: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const selected = people.find(member => member.id === value);
  const matching = people.filter(member =>
    `${member.name} ${member.id} ${member.district} ${member.email}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <fieldset className="member-picker">
    <legend>{t("Member", "Umunyamuryango")}</legend>
    {selected ? <div className="member-picker-selected">
      <input className="sr-only" type="radio" name="member" value={selected.id} checked required readOnly tabIndex={-1} aria-label={selected.name} />
      <Avatar member={selected} small />
      <span><strong>{selected.name}</strong><small>{selected.id} · {selected.district}</small></span>
      <button type="button" onClick={() => {
        onChange(""); setQuery("");
        requestAnimationFrame(() => searchRef.current?.focus());
      }}>{t("Change", "Hindura")}</button>
    </div> : <>
      <label className="search-input" htmlFor={id}><Search size={17} /><input
        id={id} ref={searchRef} type="search" autoComplete="off"
        aria-label={t("Search members to record a payment", "Shaka umunyamuryango wishyura")}
        placeholder={t("Search name, member code or district…", "Shaka izina, inomero cyangwa akarere…")}
        value={query} onChange={e => setQuery(e.target.value)}
      /></label>
      <div className="member-picker-options" aria-label={t("Matching members", "Abanyamuryango babonetse")}>
        {matching.map(member => <label key={member.id} className="member-picker-option">
          <input type="radio" name="member" value={member.id} checked={value === member.id} required onChange={() => onChange(member.id)} />
          <Avatar member={member} small />
          <span><strong>{member.name}</strong><small>{member.id} · {member.district}</small></span>
        </label>)}
        {!matching.length && <p className="member-picker-empty" role="status"><Users size={19} />{t("No members found. Try another name or code.", "Nta munyamuryango wabonetse. Hindura izina cyangwa inomero.")}</p>}
      </div>
      <span className="member-picker-hint">{matching.length} {t("members · Select the person you’re recording for", "abanyamuryango · Hitamo uwo wandikira")}</span>
    </>}
  </fieldset>;
}

export function ContributionRecordingForm({ kind, initialMemberId = "", people, onSave, onClose }: {
  kind: ContributionKind; initialMemberId?: string; people: Member[]; onSave: (record: MemberRecord) => void; onClose: () => void;
}) {
  const t = useT();
  const [memberId, setMemberId] = useState(initialMemberId);
  const formRef = useRef<HTMLFormElement>(null);
  const [shares, setShares] = useState("");
  const [amount, setAmount] = useState(kind === "social" ? "5000" : "");
  const [saved, setSaved] = useState<MemberRecord | null>(null);
  const [error, setError] = useState("");
  const saving = kind === "savings";
  const selected = people.find(member => member.id === memberId);
  const shareCount = Number(shares);
  const calculated = Number.isFinite(shareCount) && shareCount > 0 ? shareCount * SHARE_VALUE : 0;
  useEffect(() => {
    if (!memberId) return;
    const timer = window.setTimeout(() => (formRef.current?.elements.namedItem(saving ? "shares" : "amount") as HTMLInputElement | null)?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [memberId, saving]);

  if (saved) return <div className="record-success">
    <span><Check size={32} /></span><h3>{t("Added to your preview", "Byongewe mu cyitegererezo")}</h3>
    <strong>{saving ? `${money(saved.shares ?? 0)} ${t("shares", "imigabane")}` : `${money(saved.amount)} RWF`}</strong>
    {saving && <p>{money(saved.amount)} RWF · {money(SHARE_VALUE)} RWF {t("per share", "ku mugabane")}</p>}
    <p>{people.find(member => member.id === saved.memberId)?.name}</p>
    <p className="muted">{t("This record now appears in its register, the member’s account and reports. Refresh resets preview changes.", "Iyi nyandiko iri mu gitabo cyayo, muri konti y’umunyamuryango no muri raporo. Gusubiramo urupapuro bisubiza amakuru ya mbere.")}</p>
    <div className="record-success-actions"><Action secondary onClick={() => {
      setSaved(null); setMemberId(""); setShares(""); setAmount(kind === "social" ? "5000" : ""); setError("");
    }}><Plus size={16} />{t("Record another", "Andika undi")}</Action><Action onClick={onClose}>{t("Done", "Birarangiye")}<ArrowRight size={16} /></Action></div>
  </div>;

  return <form ref={formRef} className="portal-form record-form" onSubmit={event => {
    event.preventDefault();
    if (!selected) { setError(t("Search for and select a member first.", "Banza ushake kandi uhitemo umunyamuryango.")); return; }
    if (saving && (!Number.isSafeInteger(shareCount) || shareCount < 1 || shareCount > 20000)) {
      setError(t("Enter a whole number of shares between 1 and 20,000.", "Andika umubare wuzuye w’imigabane hagati ya 1 na 20,000.")); return;
    }
    const paid = saving ? calculated : Number(amount);
    if (!Number.isFinite(paid) || paid <= 0 || paid > 100000000) {
      setError(t("Enter an amount between 0.01 and 100,000,000 RWF.", "Andika amafaranga hagati ya 0.01 na 100,000,000 RWF.")); return;
    }
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") || "").trim();
    if (kind === "penalty" && !note) { setError(t("Enter the penalty reason or reference.", "Andika impamvu y’amande cyangwa inomero.")); return; }
    const item: MemberRecord = {
      id: `RC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, memberId, type: kind,
      amount: Math.round(paid * 100) / 100, ...(saving ? { shares: shareCount } : {}),
      date: String(form.get("date")), time: String(form.get("time")), period: String(form.get("period")),
      method: String(form.get("method")), note: note || (saving ? "Savings shares contribution" : "Social fund contribution"),
    };
    onSave(item); setSaved(item);
  }}>
    <MemberPicker people={people} value={memberId} onChange={id => {
      setMemberId(id); setError("");
    }} />
    {saving ? <div className="share-entry">
      <label className="field">{t("Number of shares", "Umubare w’imigabane")}<input name="shares" type="number" inputMode="numeric" min="1" max="20000" step="1" placeholder="10" value={shares} onChange={event => { setShares(event.target.value); setError(""); }} required /></label>
      <div className="share-shortcuts" aria-label={t("Quick share amounts", "Imibare y’imigabane yihuse")}>{[1, 5, 10, 20].map(count => <button type="button" key={count} aria-pressed={shares === String(count)} onClick={() => { setShares(String(count)); setError(""); }}>{count} {count === 1 ? t("share", "umugabane") : t("shares", "imigabane")}</button>)}</div>
      <div className="share-calculation"><Coins size={22} /><div><span>{t("Calculated contribution", "Agaciro k’umusanzu")}</span><output aria-live="polite">{money(calculated)} <small>RWF</small></output><p>{t("1 share", "Umugabane 1")} = {money(SHARE_VALUE)} RWF</p></div></div>
      {selected && <p className="share-commitment">{t("Monthly savings commitment", "Umusanzu w’ubwizigame wa buri kwezi")}: <strong>{money(selected.monthlySavings / SHARE_VALUE)} {t("shares", "imigabane")}</strong></p>}
    </div> : <label className="field">{t("Amount (RWF)", "Amafaranga (RWF)")}<input name="amount" type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" placeholder="5,000" value={amount} onChange={event => { setAmount(event.target.value); setError(""); }} required /></label>}
    <label className="field">{t("Contribution month", "Ukwezi k’umusanzu")}<input name="period" type="month" defaultValue={CURRENT_PERIOD} min="2026-01" max="2026-12" required /></label>
    <div className="form-grid"><label className="field">{t("Payment date", "Itariki y’ubwishyu")}<input name="date" type="date" defaultValue="2026-10-08" min="2026-01-01" max="2026-10-08" required /></label><label className="field">{t("Time (Kigali)", "Isaha (Kigali)")}<input name="time" type="time" defaultValue="12:00" required /></label></div>
    <label className="field">{t("Payment method", "Uburyo bwo kwishyura")}<select name="method"><option>Mobile Money</option><option>Bank transfer</option><option>Cash</option></select></label>
    <label className="field">{kind === "penalty" ? t("Penalty reason or reference", "Impamvu y’amande cyangwa inomero") : t("Reference or note", "Inomero cyangwa ibisobanuro")}<input name="note" maxLength={200} required={kind === "penalty"} placeholder={kind === "penalty" ? t("For example, a late meeting penalty", "Urugero: amande yo gukererwa inama") : t("Optional payment reference", "Inomero y’ubwishyu (si ngombwa)")} /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <Action type="submit"><Plus size={16} />{saving ? t("Record shares", "Andika imigabane") : kind === "social" ? t("Record social contribution", "Andika umusanzu w’ingoboka") : t("Record penalty payment", "Andika ubwishyu bw’amande")}</Action>
  </form>;
}
