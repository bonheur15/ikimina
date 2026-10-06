"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronRight, Clock3, Coins, CreditCard, HeartHandshake, List, Search, ShieldCheck, Wallet } from "lucide-react";
import { Avatar, Brand, useT } from "./dashboard";
import { getMemberRecords, money, type Member, type MemberRecord } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MemberHistorySheet({member,onClose}: {member:Member|null,onClose:()=>void}) {
  const t=useT();
  return <Sheet open={!!member} onOpenChange={open=>!open && onClose()}>
    <SheetContent className="history-sheet"><SheetHeader className="history-sheet-header"><SheetTitle>{t("A member’s story", "Amateka y’umunyamuryango")}</SheetTitle><SheetDescription>{t("Every contribution, clearly connected.", "Buri musanzu ugaragazwa neza.")}</SheetDescription></SheetHeader>
    {member && <MemberHistory key={member.id} member={member}/>}</SheetContent>
  </Sheet>;
}

function MemberHistory({member}: {member:Member}) {
  const t=useT();
  const records=useMemo(()=>getMemberRecords(member),[member]);
  const [kind,setKind]=useState("all");
  const [period,setPeriod]=useState("all");
  const [query,setQuery]=useState("");
  const [receipt,setReceipt]=useState<MemberRecord|null>(null);
  const months=[...new Set(records.map(r=>r.date.slice(0,7)))];
  const monthName=(date:string)=>{
    const n=Number(date.slice(5,7))-1;
    return t(["January","February","March","April","May","June","July","August","September","October","November","December"][n],["Mutarama","Gashyantare","Werurwe","Mata","Gicurasi","Kamena","Nyakanga","Kanama","Nzeri","Ukwakira","Ugushyingo","Ukuboza"][n]);
  };
  const dateLabel=(date:string)=>`${Number(date.slice(8,10))} ${monthName(date)} ${date.slice(0,4)}`;
  const typeLabel=(type:string)=>type==="savings"?t("Savings contribution","Umusanzu w’ubwizigame"):type==="social"?t("Social contribution","Umusanzu w’ingoboka"):t("Penalty payment","Ubwishyu bw’amande");
  const methodLabel=(method:string)=>method==="Bank transfer"?t("Bank transfer","Kohereza kuri banki"):method==="Cash"?t("Cash","Mu ntoki"):method;
  const noteLabel=(note:MemberRecord["note"])=>note==="monthly"?t("Monthly savings contribution","Umusanzu w’ubwizigame w’ukwezi"):note==="extra"?t("Additional savings contribution","Umusanzu w’ubwizigame w’inyongera"):note==="social"?t("Contribution to the shared social fund","Umusanzu mu kigega cy’ingoboka"):t("Settlement of a recorded penalty","Ubwishyu bw’amande yanditswe");
  const filtered=records.filter(r=>(kind==="all"||r.type===kind)&&(period==="all"||r.date.startsWith(period))&&`${r.id} ${typeLabel(r.type)} ${methodLabel(r.method)} ${r.amount} ${r.date}`.toLowerCase().includes(query.toLowerCase()));
  const savings=records.filter(r=>r.type==="savings").reduce((sum,r)=>sum+r.amount,0);
  const social=records.filter(r=>r.type==="social").reduce((sum,r)=>sum+r.amount,0);
  const penalty=records.filter(r=>r.type==="penalty").reduce((sum,r)=>sum+r.amount,0);
  const groups=[...new Set(filtered.map(r=>r.date.slice(0,7)))];
  const latest=records[0];
  return <><div className="member-history-layout">
    <aside className="history-profile"><div className="history-identity"><Avatar member={member}/><h2>{member.name}</h2><p>{member.id} <span>·</span> {member.district}</p><span className="status-badge ready"><Check size={12}/>{t("Active member","Umunyamuryango ukora")}</span></div>
      <div className="history-balance"><Wallet size={21}/><span>{t("Savings balance","Ubwizigame busigaye")}</span><strong>{money(member.savings)}<small>RWF</small></strong><div><Coins size={14}/>{member.shares} {t("shares","imigabane")}</div></div>
      <dl className="history-facts"><div><dt>{t("Joined the circle","Yinjiye mu kimina")}</dt><dd>{t("June 2019","Kamena 2019")}</dd></div><div><dt>{t("Account readiness","Imyiteguro ya konti")}</dt><dd>{member.email?t("Email collected","Imeyili irahari"):t("Email needed","Imeyili irakenewe")}</dd></div><div><dt>{t("Last contribution","Umusanzu uheruka")}</dt><dd>{dateLabel(latest.date)}<span>{latest.time} CAT</span></dd></div></dl>
      <div className="history-note"><ShieldCheck size={18}/><p>{t("Sample member history. All times are in Kigali (CAT, UTC+2).","Amateka y’icyitegererezo. Amasaha ni aya Kigali (CAT, UTC+2).")}</p></div>
    </aside>
    <section className="history-main"><div className="history-intro"><span className="section-kicker">{t("ONE PERSON. MANY STEPS FORWARD.","UMUNTU UMWE. INTAMBWE NYINSHI.")}</span><h2>{t("The contributions behind the balance.","Imisanzu yubaka ubwizigame.")}</h2><p>{t("Review the journey, or find a specific payment.","Reba amateka cyangwa ushake ubwishyu runaka.")}</p></div>
      <div className="history-totals"><div><span className="history-total-icon savings"><Coins size={17}/></span><span>{t("Savings added","Ubwizigame bwiyongereye")}</span><strong>{money(savings)}<small>RWF</small></strong></div><div><span className="history-total-icon social"><HeartHandshake size={17}/></span><span>{t("Social fund","Ikigega cy’ingoboka")}</span><strong>{money(social)}<small>RWF</small></strong></div><div><span className="history-total-icon penalty"><ShieldCheck size={17}/></span><span>{t("Penalties paid","Amande yishyuwe")}</span><strong>{money(penalty)}<small>RWF</small></strong></div></div><p className="history-period-note">{t("History shown: July–October 2026","Amateka agaragazwa: Nyakanga–Ukwakira 2026")}</p>
      <Tabs defaultValue="timeline" className="history-tabs"><div className="history-view-toolbar"><TabsList><TabsTrigger value="timeline"><Clock3 size={15}/>{t("Timeline","Amateka")}</TabsTrigger><TabsTrigger value="ledger"><List size={15}/>{t("Record list","Urutonde")}</TabsTrigger></TabsList><span>{filtered.length} {t("records","inyandiko")}</span></div>
        <div className="history-filters"><div className="search-box"><Search size={16}/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("Search reference, method…","Shaka inomero, uburyo…")} aria-label={t("Search member records","Shaka inyandiko z’umunyamuryango")}/></div><Select value={kind} onValueChange={setKind}><SelectTrigger aria-label={t("Contribution type","Ubwoko bw’umusanzu")}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("All types","Ubwoko bwose")}</SelectItem><SelectItem value="savings">{t("Savings","Ubwizigame")}</SelectItem><SelectItem value="social">{t("Social fund","Ingoboka")}</SelectItem><SelectItem value="penalty">{t("Penalties","Amande")}</SelectItem></SelectContent></Select><Select value={period} onValueChange={setPeriod}><SelectTrigger aria-label={t("Contribution month","Ukwezi kw’umusanzu")}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("All months","Amezi yose")}</SelectItem>{months.map(m=><SelectItem key={m} value={m}>{monthName(`${m}-01`)} 2026</SelectItem>)}</SelectContent></Select></div>
        <TabsContent value="timeline"><div className="contribution-timeline">{groups.map(month=><section className="timeline-month" key={month}><div className="timeline-month-heading"><span>{monthName(`${month}-01`)} 2026</span><span>{filtered.filter(r=>r.date.startsWith(month)).length} {t("records","inyandiko")}</span></div>{filtered.filter(r=>r.date.startsWith(month)).map(record=><button className="timeline-record" key={record.id} onClick={()=>setReceipt(record)}><span className={`timeline-icon ${record.type}`}>{record.type==="savings"?<Coins size={17}/>:record.type==="social"?<HeartHandshake size={17}/>:<ShieldCheck size={17}/>}</span><div className="timeline-record-body"><div className="timeline-title"><strong>{typeLabel(record.type)}</strong><span>+{money(record.amount)} <small>RWF</small></span></div><div className="timeline-meta"><span><CalendarDays size={12}/>{dateLabel(record.date)}</span><span><Clock3 size={12}/>{record.time} CAT</span></div><div className="timeline-reference"><span>{record.id} <i>·</i> {methodLabel(record.method)}</span><ChevronRight size={14}/></div>{record.type==="savings" && <div className="timeline-balance">{t("Savings balance after payment","Ubwizigame nyuma y’ubwishyu")}<strong>{money(record.balance)} RWF</strong></div>}</div></button>)}</section>)}</div></TabsContent>
        <TabsContent value="ledger"><div className="history-ledger"><Table><TableHeader><TableRow><TableHead>{t("PAYMENT","UBWISHYU")}</TableHead><TableHead>{t("DATE & TIME","ITARIKI N’ISAHA")}</TableHead><TableHead className="text-right">{t("AMOUNT","AMAFARANGA")}</TableHead><TableHead className="text-right">{t("BALANCE","UBWIZIGAME")}</TableHead></TableRow></TableHeader><TableBody>{filtered.map(record=><TableRow key={record.id}><TableCell><button className="history-ledger-link" onClick={()=>setReceipt(record)}><strong>{typeLabel(record.type)}</strong><span>{record.id} · {methodLabel(record.method)}</span></button></TableCell><TableCell><span className="ledger-date">{dateLabel(record.date)}</span><span className="ledger-time">{record.time} CAT</span></TableCell><TableCell className="text-right amount-cell">+{money(record.amount)}<small> RWF</small></TableCell><TableCell className="text-right">{money(record.balance)}<small className="muted-cell"> RWF</small></TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
      </Tabs>{filtered.length===0 && <div className="history-empty"><Search size={25}/><h3>{t("No matching contributions","Nta misanzu ihuye n’ibyo washakishije")}</h3><p>{t("Try a different month, type or reference.","Hindura ukwezi, ubwoko cyangwa inomero.")}</p><Button variant="outline" onClick={()=>{setKind("all");setPeriod("all");setQuery("");}}>{t("Clear filters","Kuraho ibyo washakishije")}</Button></div>}
    </section>
  </div>
  <Dialog open={!!receipt} onOpenChange={open=>!open && setReceipt(null)}><DialogContent className="payment-receipt"><DialogHeader><DialogTitle>{t("Payment details","Amakuru y’ubwishyu")}</DialogTitle><DialogDescription>{t("The complete record for this contribution.","Amakuru yose yerekeye uyu musanzu.")}</DialogDescription></DialogHeader>{receipt && <div className="receipt-paper"><div className="receipt-brand"><Brand/><span className="status-badge ready"><Check size={12}/>{t("Recorded","Byanditswe")}</span></div><div className="receipt-amount"><span>{typeLabel(receipt.type)}</span><strong>{money(receipt.amount)}<small>RWF</small></strong></div><div className="receipt-member"><Avatar member={member} small/><div><strong>{member.name}</strong><span>{member.id}</span></div></div><dl><div><dt>{t("Reference","Inomero")}</dt><dd>{receipt.id}</dd></div><div><dt>{t("Date","Itariki")}</dt><dd>{dateLabel(receipt.date)}</dd></div><div><dt>{t("Time","Isaha")}</dt><dd>{receipt.time} CAT (UTC+2)</dd></div><div><dt>{t("Payment method","Uburyo bwo kwishyura")}</dt><dd><CreditCard size={14}/>{methodLabel(receipt.method)}</dd></div><div><dt>{t("Savings balance","Ubwizigame busigaye")}</dt><dd>{money(receipt.balance)} RWF</dd></div></dl><div className="receipt-note">{noteLabel(receipt.note)}</div><p className="receipt-footnote">{t("Illustrative record · UI preview","Inyandiko y’icyitegererezo · Urugero")}</p></div>}</DialogContent></Dialog>
  </>;
}
