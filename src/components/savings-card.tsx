import { ArrowUpRight, Coins, Users, Wifi } from "lucide-react";
import { money } from "@/lib/portal-data";
import { useT } from "./portal-ui";

export function SavingsCard({ balance, added, shares, memberCount, groupName }: {
  balance: number; added: number; shares: number; memberCount: number; groupName: string;
}) {
  const t = useT();
  return <section className="savings-credit-card" aria-label={t("Collective savings card", "Ikarita y’ubwizigame bw’ikimina")}>
    <svg className="savings-card-pattern" viewBox="0 0 360 227" preserveAspectRatio="none" aria-hidden="true">
      <path d="M270 -50C160 30 330 100 235 180S170 265 260 285M305 -50C195 30 365 100 270 180S205 265 295 285M340 -50C230 30 400 100 305 180S240 265 330 285" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
    <div className="savings-credit-card-header">
      <span className="savings-card-wordmark">ikimina<span>.</span></span>
      <span className="savings-card-hardware" aria-hidden="true">
        <svg className="savings-card-chip" viewBox="0 0 40 30" fill="none">
          <rect x=".75" y=".75" width="38.5" height="28.5" rx="6" fill="#E9CB8B" stroke="#F5E1B4" strokeWidth="1.5" />
          <rect x="12" y="7" width="16" height="16" rx="3" stroke="#AE8B48" />
          <path d="M0 10H12M0 20H12M28 10H40M28 20H40M20 0V7M20 23V30" stroke="#AE8B48" />
        </svg>
        <Wifi size={19} className="savings-card-contactless" />
      </span>
    </div>
    <div className="savings-credit-card-balance">
      <span>{t("COLLECTIVE SAVINGS", "UBWIZIGAME BW’IKIMINA")}</span>
      <h2>{money(balance)}<small>RWF</small></h2>
      <p><ArrowUpRight size={13} /><b>+{money(added)}</b><span>{t("this month", "uku kwezi")}</span></p>
    </div>
    <div className="savings-credit-card-footer">
      <strong title={groupName}>{groupName}</strong>
      <div><span><Users size={12} />{memberCount} {t("members", "abanyamuryango")}</span><span><Coins size={12} />{money(shares)} {t("shares", "imigabane")}</span></div>
    </div>
  </section>;
}
