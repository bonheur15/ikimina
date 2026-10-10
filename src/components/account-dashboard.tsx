"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Coins, FileText, Globe2, Heart, History, Home, LayoutDashboard, Menu, Settings2, ShieldCheck, UserRound, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { initialRecords, memberRecords, members, type ContributionKind, type Member, type MemberRecord } from "@/lib/portal-data";
import { adminRoutes } from "@/lib/portal-navigation";
import { Action, ActivityList, Avatar, Brand, LanguageContext, RecordDetail, useT, type Translate } from "./portal-ui";
import { MemberDashboard, type MemberTab } from "./member-dashboard";
import { AdminDashboard, type AdminTab } from "./admin-dashboard";
import { ContributionRecordingForm } from "./contribution-recording";

type PortalState = {
  people: Member[]; records: MemberRecord[]; language: "en" | "rw"; groupName: string;
  setLanguage: (language: "en" | "rw") => void; setGroupName: (name: string) => void;
  updateMember: (member: Member) => void; addRecord: (record: MemberRecord) => void;
};
const PortalContext = createContext<PortalState | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState(members);
  const [records, setRecords] = useState(initialRecords);
  const [language, setLanguage] = useState<"en" | "rw">("en");
  const [groupName, setGroupName] = useState("Ubumwe Savings Group");
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const t: Translate = (en, rw) => language === "en" ? en : rw;
  return <PortalContext.Provider value={{ people, records, language, setLanguage, groupName, setGroupName,
    updateMember: member => setPeople(current => current.map(m => m.id === member.id ? member : m)),
    addRecord: record => setRecords(current => [record, ...current].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`) || b.id.localeCompare(a.id))),
  }}><LanguageContext.Provider value={t}>{children}</LanguageContext.Provider></PortalContext.Provider>;
}
const memberNavigation = [
  { id: "home", en: "My overview", rw: "Incamake yanjye", short: "Home", shortRw: "Ahabanza", icon: Home },
  { id: "history", en: "My contributions", rw: "Imisanzu yanjye", short: "History", shortRw: "Amateka", icon: History },
  { id: "statements", en: "My statements", rw: "Raporo zanjye", short: "Statements", shortRw: "Raporo", icon: FileText },
  { id: "account", en: "My account", rw: "Konti yanjye", short: "Account", shortRw: "Konti", icon: UserRound },
] as const;
const adminNavigation = [
  { id: "overview", en: "Overview", rw: "Incamake", icon: LayoutDashboard },
  { id: "members", en: "Members", rw: "Abanyamuryango", icon: Users },
  { id: "contributions", en: "Contributions", rw: "Imisanzu", icon: Coins },
  { id: "social", en: "Social fund", rw: "Ingoboka", icon: Heart },
  { id: "penalties", en: "Penalties", rw: "Amande", icon: ShieldCheck },
  { id: "cashbook", en: "Cashbook", rw: "Igitabo cy’imari", icon: BookOpen },
  { id: "reports", en: "Reports", rw: "Raporo", icon: FileText },
  { id: "settings", en: "Settings", rw: "Igenamiterere", icon: Settings2 },
] as const;

export function AccountDashboard({ role = "member" }: { role?: "member" | "admin" }) {
  const state = useContext(PortalContext);
  if (!state) throw new Error("AccountDashboard requires AccountProvider");
  return <AccountWorkspace role={role} state={state} key={role} />;
}
function AccountWorkspace({ role, state }: { role: "member" | "admin"; state: PortalState }) {
  const t = useT();
  const admin = role === "admin";
  const pathname = usePathname();
  const router = useRouter();
  const [memberView, setMemberView] = useState<string>("home");
  const adminView = (Object.keys(adminRoutes) as AdminTab[]).find(key => adminRoutes[key] === pathname) ?? "overview";
  const view = admin ? adminView : memberView;
  const [menu, setMenu] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const [record, setRecord] = useState(false);
  const [recordKind, setRecordKind] = useState<ContributionKind>("savings");
  const [recordMember, setRecordMember] = useState("");
  const [recordSession, setRecordSession] = useState(0);
  const [receipt, setReceipt] = useState<MemberRecord | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const currentMember = state.people[0];
  const ownRecords = memberRecords(state.records, currentMember.id);
  const nav = admin ? adminNavigation : memberNavigation;
  const currentNav = nav.find(n => n.id === view) ?? nav[0];
  const navigate = (next: string) => {
    if (admin) router.push(adminRoutes[next as AdminTab]);
    else setMemberView(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  };
  const openRecord = (kind: ContributionKind = "savings", memberId = "") => { setRecordKind(kind); setRecordMember(memberId); setRecordSession(session => session + 1); setRecord(true); };
  const sidebar = <><div className="sidebar-brand"><Link href={admin ? "/admin" : "/member"} aria-label="Ikimina home"><Brand /></Link></div><div className="group-selector"><span className="group-symbol"><Users size={18} /></span><div><strong>{state.groupName}</strong><span>{admin ? t("Administrator workspace", "Urubuga rw’umuyobozi") : t("Member workspace", "Urubuga rw’umunyamuryango")}</span></div></div><p className="nav-caption">{admin ? t("MANAGE YOUR CIRCLE", "YOBORA IKIMINA") : t("YOUR PERSONAL SPACE", "URUBUGA RWAWE")}</p><nav className="side-navigation" aria-label={t("Main navigation", "Ibikubiyemo")}>
    {nav.map(({ id, en, rw, icon: Icon }) => {
      const content = <><Icon size={19} /><span>{t(en, rw)}</span>{view === id && <span className="nav-active-dot" />}</>;
      return admin ? <Link key={id} href={adminRoutes[id as AdminTab]} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setMenu(false)}>{content}</Link> : <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>{content}</button>;
    })}
  </nav><div className="sidebar-lower"><div className="sidebar-message"><span className="sidebar-message-mark"><ArrowUpRight size={28} /></span><strong>{t("Better, together.", "Dufatanyije, dutera imbere.")}</strong><p>{t("Every contribution builds a stronger community.", "Buri musanzu wubaka ikimina gikomeye.")}</p></div><button className="sidebar-help" onClick={() => { setMenu(false); setHelp(true); }}><CircleHelp size={18} />{t("Help & support", "Ubufasha")}<ArrowUpRight size={15} /></button><Link className="workspace-switch" href={admin ? "/member" : "/admin"}><ShieldCheck size={17} /><span>{admin ? t("Member preview", "Urugero rw’umunyamuryango") : t("Administrator preview", "Urugero rw’umuyobozi")}</span><ArrowRight size={15} /></Link><div className="sidebar-identity">{admin ? <span className="admin-avatar">AK</span> : <Avatar member={currentMember} small />}<div><strong>{admin ? "Alex K." : currentMember.name}</strong><span>{admin ? t("Group administrator", "Umuyobozi w’ikimina") : currentMember.id}</span></div><ShieldCheck size={16} /></div></div></>;
  return <div className={`portal-app ${admin ? "admin-portal" : "member-portal"}`}><a className="skip-link" href="#portal-main">{t("Skip to content", "Jya ku bikubiyemo")}</a><aside className="desktop-sidebar">{sidebar}</aside><div className="portal-body"><header className="portal-topbar"><div className="topbar-location"><span className="mobile-brand"><Brand /></span><span className="desktop-breadcrumb">{admin ? t("Group workspace", "Urubuga rw’ikimina") : t("My workspace", "Urubuga rwanjye")}<ChevronRight size={13} /><strong>{t(currentNav.en, currentNav.rw)}</strong></span></div><div className="topbar-controls"><span className="preview-label"><i />{t("Sample preview", "Icyitegererezo")}</span><button className="language-control" aria-label={t("Switch to Kinyarwanda", "Hindura mu Cyongereza")} onClick={() => state.setLanguage(state.language === "en" ? "rw" : "en")}><Globe2 size={16} /><span>{state.language === "en" ? "EN" : "RW"}</span></button><button className="icon-button notification-trigger" aria-label={t("Notifications", "Amakuru mashya")} onClick={() => setNotifications(true)}><Bell size={19} /><i /></button><button className="header-avatar" aria-label={t("Open account", "Fungura konti")} onClick={() => navigate(admin ? "settings" : "account")}>{admin ? <span className="admin-avatar">AK</span> : <Avatar member={currentMember} small />}</button></div></header><main id="portal-main" className="portal-main" ref={mainRef} tabIndex={-1}>
      {admin ? <AdminDashboard key={view} view={view as AdminTab} people={state.people} records={state.records} navigate={navigate} onRecord={openRecord} groupName={state.groupName} onGroupName={state.setGroupName} language={state.language} onLanguage={state.setLanguage} /> : <MemberDashboard key={view} view={view as MemberTab} member={currentMember} records={state.records} navigate={navigate} onUpdate={state.updateMember} language={state.language} onLanguage={state.setLanguage} onHelp={() => setHelp(true)} />}
      <footer className="portal-footer"><span><span className="footer-mark"><Coins size={15} /></span>{t("Your contributions. Our community.", "Imisanzu yawe. Ikimina cyacu.")}</span><span>{t("Sample records · Account design preview", "Inyandiko z’icyitegererezo · Urugero rwa konti")}</span></footer>
    </main></div><nav className="bottom-navigation" aria-label={t("Mobile navigation", "Ibikubiyemo bya telefoni")}>
      {admin ? <>{adminNavigation.filter(n => ["overview", "contributions", "social", "penalties"].includes(n.id)).map(({ id, en, rw, icon: Icon }) => <Link key={id} href={adminRoutes[id]} onClick={() => setMenu(false)} aria-current={view === id ? "page" : undefined}><Icon size={20} /><span>{id === "contributions" ? t("Savings", "Ubwizigame") : t(en, rw)}</span></Link>)}<button onClick={() => setMenu(true)} aria-expanded={menu} aria-current={["members", "cashbook", "reports", "settings"].includes(view) ? "page" : undefined}><Menu size={20} /><span>{t("More", "Ibindi")}</span></button></> : memberNavigation.map(({ id, short, shortRw, icon: Icon }) => <button key={id} onClick={() => navigate(id)} aria-current={view === id ? "page" : undefined}><Icon size={21} /><span>{t(short, shortRw)}</span></button>)}
    </nav><Sheet open={menu} onOpenChange={setMenu}><SheetContent side="left" className="mobile-sidebar"><SheetHeader className="sr-only"><SheetTitle>{t("Navigation", "Ibikubiyemo")}</SheetTitle><SheetDescription>{t("Choose a workspace section.", "Hitamo igice cy’urubuga.")}</SheetDescription></SheetHeader>{sidebar}</SheetContent></Sheet>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{t("A little guidance", "Ubufasha bugufi")}</DialogTitle><DialogDescription>{t("Get to know your Ikimina workspace.", "Menya urubuga rwa Ikimina.")}</DialogDescription></DialogHeader><div className="help-top"><span className="stat-icon mint"><Heart size={22} /></span><p>{t("Your records should always be easy to understand.", "Inyandiko zawe zigomba gusobanuka neza.")}</p></div>{[
      [t("What does my savings balance include?", "Ubwizigame bwanjye burimo iki?"), t("Your opening savings and recorded savings contributions. Social payments and interest allocations are shown separately.", "Ubwizigame butangira n’imisanzu y’ubwizigame. Ingoboka n’inyungu zigaragazwa ukwazo.")],
      [t("Where can I find a contribution?", "Nabona umusanzu he?"), t("Open your contribution history, filter by month or type, and tap a record for its reference, method and savings balance.", "Fungura amateka y’imisanzu, hitamo ukwezi cyangwa ubwoko, ukande ku nyandiko urebe amakuru.")],
      [t("Can I download my records?", "Nakora kopi y’inyandiko?"), t("Yes. Contributions and statements can be downloaded as CSV files for your records.", "Yego. Ushobora gukuramo imisanzu na raporo mu nyandiko za CSV.")],
      [t("Are these real accounts?", "Izi ni konti nyazo?"), t("This is a design preview with fictional members. Changes last while you explore; refreshing resets them. Real accounts and payments are not connected yet.", "Iki ni icyitegererezo gifite abanyamuryango bahimbwe. Gusubiramo urupapuro bisubiza amakuru ya mbere. Konti n’ubwishyu nyabyo ntibirahuzwa.")],
    ].map(([q, a]) => <details className="help-question" key={q}><summary>{q}<ChevronDown size={16} /></summary><p>{a}</p></details>)}</DialogContent></Dialog>
    <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{t("Your updates", "Amakuru yawe")}</DialogTitle><DialogDescription>{t("Recent activity in this sample workspace.", "Ibikorwa biheruka mu cyitegererezo.")}</DialogDescription></DialogHeader><ActivityList records={admin ? state.records : ownRecords} people={admin ? state.people : undefined} limit={3} onSelect={r => { setNotifications(false); setReceipt(r); }} /><div className="notification-note"><Check size={17} />{t("October statements are available to review.", "Raporo z’Ukwakira zirahari.")}</div><Action secondary onClick={() => { setNotifications(false); navigate(admin ? "reports" : "statements"); }}>{t("Open statements", "Fungura raporo")}<ArrowRight size={16} /></Action></DialogContent></Dialog>
    <RecordDetail record={receipt} member={state.people.find(m => m.id === receipt?.memberId) ?? currentMember} records={state.records} onClose={() => setReceipt(null)} />
    <Dialog open={record} onOpenChange={setRecord}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{recordKind === "savings" ? t("Record savings shares", "Andika imigabane y’ubwizigame") : recordKind === "social" ? t("Record social contribution", "Andika umusanzu w’ingoboka") : t("Record penalty payment", "Andika ubwishyu bw’amande")}</DialogTitle><DialogDescription>{recordKind === "savings" ? t("Find a member and enter their shares. Each share is worth 5,000 RWF.", "Shaka umunyamuryango wandike imigabane. Buri mugabane ni 5,000 RWF.") : t("Find a member and record a sample payment in this register.", "Shaka umunyamuryango wandike ubwishyu bw’icyitegererezo muri iki gitabo.")}</DialogDescription></DialogHeader><ContributionRecordingForm key={`${recordKind}-${recordSession}`} kind={recordKind} initialMemberId={recordMember} people={state.people} onSave={state.addRecord} onClose={() => setRecord(false)} /></DialogContent></Dialog>
  </div>;
}
