"use client";

import { BrandLoader } from "@/components/brand-loader";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Coins, FileText, Globe2, Heart, History, Home, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, UserRound, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { memberRecords, type ContributionKind, type Member, type MemberRecord } from "@/lib/portal-data";
import { recentActivity } from "@/app/actions/lookup";
import { logout } from "@/app/login/actions";
import { adminRoutes } from "@/lib/portal-navigation";
import { Action, ActivityList, Avatar, Brand, EmptyState, LanguageContext, RecordDetail, useT, type Translate } from "./portal-ui";
import { MemberDashboard, type MemberTab } from "./member-dashboard";
import type { AdminTab } from "@/lib/portal-navigation";
import { ContributionRecordingForm } from "./contribution-recording";
import { InstallAppButton, InstallAppPrompt } from "./pwa";

export type PortalViewer = { name: string; role: "admin" | "member"; memberCode: string | null; email: string | null };
export type Language = "en" | "rw";
/** Administrator pages load their own (paginated) data; only the member portal receives the member's records here. */
type PortalData = { viewer: PortalViewer; groupName: string; socialMonthly: number; people?: Member[]; records?: MemberRecord[] };
type PortalState = PortalData & {
  language: "en" | "rw"; setLanguage: (language: "en" | "rw") => void;
  /** Re-fetches server data after a change. */
  refresh: () => void;
};
const PortalContext = createContext<PortalState | null>(null);
export const usePortal = () => {
  const state = useContext(PortalContext);
  if (!state) throw new Error("usePortal requires AccountProvider");
  return state;
};
/** Actions any page inside the portal shell can trigger. */
type Workspace = {
  openRecord: (kind?: ContributionKind, memberId?: string) => void;
  openReceipt: (reference: string) => void;
  navigate: (view: string) => void;
  refresh: () => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export const useWorkspace = () => {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace requires AccountDashboard");
  return workspace;
};
export function AccountProvider({ children, initialLanguage = "en", ...data }: PortalData & { initialLanguage?: Language; children: ReactNode }) {
  const router = useRouter();
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  // Remembered in a cookie so the server renders the chosen language on the next visit.
  const setLanguage = (next: Language) => { setLanguageState(next); document.cookie = `elayo-language=${next}; path=/; max-age=31536000; samesite=lax`; };
  const t: Translate = (en, rw) => language === "en" ? en : rw;
  return <PortalContext.Provider value={{ ...data, language, setLanguage, refresh: () => router.refresh() }}><LanguageContext.Provider value={t}>{children}</LanguageContext.Provider></PortalContext.Provider>;
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

/** The portal shell. Pages that bring their own content (e.g. the workbook viewer) pass it as children. */
export function AccountDashboard({ role = "member", children }: { role?: "member" | "admin"; children?: ReactNode }) {
  const state = usePortal();
  return <AccountWorkspace role={role} state={state} key={role}>{children}</AccountWorkspace>;
}
function AccountWorkspace({ role, state, children }: { role: "member" | "admin"; state: PortalState; children?: ReactNode }) {
  const t = useT();
  const admin = role === "admin";
  const pathname = usePathname();
  const router = useRouter();
  const [memberView, setMemberView] = useState<string>("home");
  const adminView = (Object.keys(adminRoutes) as AdminTab[]).find(key => adminRoutes[key] === pathname || (key !== "overview" && pathname.startsWith(`${adminRoutes[key]}/`))) ?? "overview";
  const view = admin ? adminView : memberView;
  const [menu, setMenu] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const [record, setRecord] = useState(false);
  const [recordKind, setRecordKind] = useState<ContributionKind>("savings");
  const [recordMember, setRecordMember] = useState("");
  const [recordSession, setRecordSession] = useState(0);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [recent, setRecent] = useState<MemberRecord[] | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const viewer = state.viewer;
  const people = state.people ?? [], records = state.records ?? [];
  const currentMember = people.find(m => m.id === viewer.memberCode) ?? people[0];
  const ownRecords = currentMember ? memberRecords(records, currentMember.id) : [];
  const viewerInitials = viewer.name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
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
  const openNotifications = () => { setNotifications(true); setRecent(null); recentActivity().then(setRecent); };
  const workspace: Workspace = { openRecord, openReceipt: setReceipt, navigate, refresh: state.refresh };
  const sidebar = <><div className="sidebar-brand"><Link href={admin ? "/admin" : "/member"} aria-label="Elayo Family home"><Brand /></Link></div>{!admin && <div className="group-selector"><span className="group-symbol"><Users size={18} /></span><div><strong>{state.groupName}</strong><span>{t("Member workspace", "Urubuga rw’umunyamuryango")}</span></div></div>}<p className="nav-caption">{admin ? t("MANAGE YOUR CIRCLE", "YOBORA IKIMINA") : t("YOUR PERSONAL SPACE", "URUBUGA RWAWE")}</p><nav className="side-navigation" aria-label={t("Main navigation", "Ibikubiyemo")}>
    {nav.map(({ id, en, rw, icon: Icon }) => {
      const content = <><Icon size={19} /><span>{t(en, rw)}</span>{view === id && <span className="nav-active-dot" />}</>;
      return admin ? <Link key={id} href={adminRoutes[id as AdminTab]} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => setMenu(false)}>{content}</Link> : <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>{content}</button>;
    })}
  </nav><div className="sidebar-lower"><div className="sidebar-message"><Image className="sidebar-community-photo" src="/images/elayo/community.jpeg" alt={t("Elayo Family members gathered together", "Abanyamuryango ba Elayo Family bari hamwe")} width={1280} height={854} unoptimized /><strong>{t("Save together. Grow together.", "Twizigame hamwe. Dutere imbere hamwe.")}</strong><p>{t("Every contribution builds a stronger community.", "Buri musanzu wubaka ikimina gikomeye.")}</p></div><button className="sidebar-help" onClick={() => { setMenu(false); setHelp(true); }}><CircleHelp size={18} />{t("Help & support", "Ubufasha")}<ArrowUpRight size={15} /></button><InstallAppButton t={t} />{admin && viewer.memberCode && <Link className="workspace-switch" href="/member"><UserRound size={17} /><span>{t("My member account", "Konti yanjye y’umunyamuryango")}</span><ArrowRight size={15} /></Link>}{!admin && viewer.role === "admin" && <Link className="workspace-switch" href="/admin"><ShieldCheck size={17} /><span>{t("Administrator workspace", "Urubuga rw’umuyobozi")}</span><ArrowRight size={15} /></Link>}<div className="sidebar-identity">{admin || !currentMember ? <span className="admin-avatar">{viewerInitials}</span> : <Avatar member={currentMember} small />}<div><strong>{viewer.name}</strong><span>{admin ? t("Group administrator", "Umuyobozi w’ikimina") : viewer.memberCode}</span></div><form action={logout}><button type="submit" className="icon-button sign-out" aria-label={t("Sign out", "Sohoka")} title={t("Sign out", "Sohoka")}><LogOut size={16} /></button></form></div></div></>;
  return <WorkspaceContext.Provider value={workspace}><div className={`portal-app ${admin ? "admin-portal" : "member-portal"}`}><a className="skip-link" href="#portal-main">{t("Skip to content", "Jya ku bikubiyemo")}</a><aside className="desktop-sidebar">{sidebar}</aside><div className="portal-body"><header className="portal-topbar"><div className="topbar-location"><span className="mobile-brand"><Brand /></span><span className="desktop-breadcrumb">{admin ? t("Group workspace", "Urubuga rw’ikimina") : t("My workspace", "Urubuga rwanjye")}<ChevronRight size={13} /><strong>{t(currentNav.en, currentNav.rw)}</strong></span></div><div className="topbar-controls"><button className="language-control" aria-label={t("Switch to Kinyarwanda", "Hindura mu Cyongereza")} onClick={() => state.setLanguage(state.language === "en" ? "rw" : "en")}><Globe2 size={16} /><span>{state.language === "en" ? "EN" : "RW"}</span></button><button className="icon-button notification-trigger" aria-label={t("Notifications", "Amakuru mashya")} onClick={openNotifications}><Bell size={19} /><i /></button><button className="header-avatar" aria-label={t("Open account", "Fungura konti")} onClick={() => navigate(admin ? "settings" : "account")}>{admin || !currentMember ? <span className="admin-avatar">{viewerInitials}</span> : <Avatar member={currentMember} small />}</button></div></header><main id="portal-main" className="portal-main" ref={mainRef} tabIndex={-1}>
      <InstallAppPrompt t={t} />
      {children ?? (admin ? null : currentMember ? <MemberDashboard key={view} view={view as MemberTab} member={currentMember} socialMonthly={state.socialMonthly} records={records} navigate={navigate} onChanged={state.refresh} language={state.language} onLanguage={state.setLanguage} onHelp={() => setHelp(true)} /> : <EmptyState text={t("No member profile is linked to this account", "Nta munyamuryango uhujwe n’iyi konti")} detail={t("Ask your group administrator to link your account.", "Saba umuyobozi w’ikimina guhuza konti yawe.")} />)}
      <footer className="portal-footer"><span><span className="footer-mark"><Coins size={15} /></span>{t("Your contributions. Our community.", "Imisanzu yawe. Elayo Family cyacu.")}</span><span>{t("Amounts in Rwandan francs (RWF)", "Amafaranga mu manyarwanda (RWF)")}</span></footer>
    </main></div><nav className="bottom-navigation" aria-label={t("Mobile navigation", "Ibikubiyemo bya telefoni")}>
      {admin ? <>{adminNavigation.filter(n => ["overview", "contributions", "social", "penalties"].includes(n.id)).map(({ id, en, rw, icon: Icon }) => <Link key={id} href={adminRoutes[id]} onClick={() => setMenu(false)} aria-current={view === id ? "page" : undefined}><Icon size={20} /><span>{id === "contributions" ? t("Savings", "Ubwizigame") : t(en, rw)}</span></Link>)}<button onClick={() => setMenu(true)} aria-expanded={menu} aria-current={["members", "cashbook", "reports", "settings"].includes(view) ? "page" : undefined}><Menu size={20} /><span>{t("More", "Ibindi")}</span></button></> : memberNavigation.map(({ id, short, shortRw, icon: Icon }) => <button key={id} onClick={() => navigate(id)} aria-current={view === id ? "page" : undefined}><Icon size={21} /><span>{t(short, shortRw)}</span></button>)}
    </nav><Sheet open={menu} onOpenChange={setMenu}><SheetContent side="left" className="mobile-sidebar"><SheetHeader className="sr-only"><SheetTitle>{t("Navigation", "Ibikubiyemo")}</SheetTitle><SheetDescription>{t("Choose a workspace section.", "Hitamo igice cy’urubuga.")}</SheetDescription></SheetHeader>{sidebar}</SheetContent></Sheet>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{t("A little guidance", "Ubufasha bugufi")}</DialogTitle><DialogDescription>{t("Get to know your Elayo Family workspace.", "Menya urubuga rwa Elayo Family.")}</DialogDescription></DialogHeader><div className="help-top"><span className="stat-icon mint"><Heart size={22} /></span><p>{t("Your records should always be easy to understand.", "Inyandiko zawe zigomba gusobanuka neza.")}</p></div>{[
      [t("What does my savings balance include?", "Ubwizigame bwanjye burimo iki?"), t("Your opening savings and recorded savings contributions. Social payments and interest allocations are shown separately.", "Ubwizigame butangira n’imisanzu y’ubwizigame. Ingoboka n’inyungu zigaragazwa ukwazo.")],
      [t("Where can I find a contribution?", "Nabona umusanzu he?"), t("Open your contribution history, filter by month or type, and tap a record for its reference, method and savings balance.", "Fungura amateka y’imisanzu, hitamo ukwezi cyangwa ubwoko, ukande ku nyandiko urebe amakuru.")],
      [t("Can I download my records?", "Nakora kopi y’inyandiko?"), t("Yes. Contributions and statements can be downloaded as CSV files for your records.", "Yego. Ushobora gukuramo imisanzu na raporo mu nyandiko za CSV.")],
      [t("Why do older records show only a month?", "Kuki inyandiko za kera zigaragaza ukwezi gusa?"), t("Records before this app were kept in monthly registers, which show the month a contribution counts for but not the exact payment day.", "Inyandiko zabanje zandikwaga buri kwezi, zerekana ukwezi umusanzu ubarirwamo ariko ntizerekane umunsi nyawo wishyuriweho.")],
      [t("Something looks wrong. What should I do?", "Mbonye ikosa. Nkore iki?"), t("Contact your group administrator with the record’s reference. Corrections are made by the administrator and kept on record.", "Vugana n’umuyobozi w’ikimina umuhe inomero y’inyandiko. Umuyobozi ni we ukosora kandi bigakomeza kwandikwa.")],
    ].map(([q, a]) => <details className="help-question" key={q}><summary>{q}<ChevronDown size={16} /></summary><p>{a}</p></details>)}</DialogContent></Dialog>
    <Dialog open={notifications} onOpenChange={setNotifications}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{t("Your updates", "Amakuru yawe")}</DialogTitle><DialogDescription>{t("The latest records in your workspace.", "Inyandiko ziheruka mu rubuga rwawe.")}</DialogDescription></DialogHeader>{recent ? <ActivityList records={admin ? recent : ownRecords} showMember={admin} limit={admin ? 5 : 3} onSelect={r => { setNotifications(false); setReceipt(r.id); }} /> : <div className="dialog-loading"><BrandLoader label={t("Loading…", "Tegereza gato…")} /></div>}<div className="notification-note"><Check size={17} />{t("Statements can be downloaded at any time.", "Raporo zishobora gukururwa igihe cyose.")}</div><Action secondary onClick={() => { setNotifications(false); navigate(admin ? "reports" : "statements"); }}>{t("Open statements", "Fungura raporo")}<ArrowRight size={16} /></Action></DialogContent></Dialog>
    <RecordDetail reference={receipt} admin={admin} onChanged={state.refresh} onClose={() => setReceipt(null)} />
    <Dialog open={record} onOpenChange={setRecord}><DialogContent className="portal-dialog"><DialogHeader><DialogTitle>{recordKind === "savings" ? t("Record savings shares", "Andika imigabane y’ubwizigame") : recordKind === "social" ? t("Record social contribution", "Andika umusanzu w’ingoboka") : t("Record penalty payment", "Andika ubwishyu bw’amande")}</DialogTitle><DialogDescription>{recordKind === "savings" ? t("Find a member and enter their shares. Each share is worth 5,000 RWF.", "Shaka umunyamuryango wandike imigabane. Buri mugabane ni 5,000 RWF.") : t("Find a member and record their payment in this register.", "Shaka umunyamuryango wandike ubwishyu bwe muri iki gitabo.")}</DialogDescription></DialogHeader><ContributionRecordingForm key={`${recordKind}-${recordSession}`} kind={recordKind} initialMemberId={recordMember} socialMonthly={state.socialMonthly} onSaved={state.refresh} onClose={() => setRecord(false)} /></DialogContent></Dialog>
  </div></WorkspaceContext.Provider>;
}
