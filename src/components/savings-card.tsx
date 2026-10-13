import { ArrowUpRight, Coins, Eye, EyeOff, Users, Wifi } from "lucide-react";
import Image from "next/image";
import { SHARE_VALUE, money } from "@/lib/portal-data";
import { useT } from "./portal-ui";

type SavingsCardProps = { balance: number; added: number; shares: number } & (
  | { variant?: "group"; memberCount: number; groupName: string }
  | { variant: "member"; memberName: string; memberId: string; hidden: boolean; onToggleVisibility: () => void }
);

export function SavingsCard(props: SavingsCardProps) {
  const t = useT();
  const personal = props.variant === "member";
  const hidden = personal && props.hidden;
  const cardholder = personal ? props.memberName : props.groupName;
  return (
    <section
      className="savings-credit-card"
      aria-label={
        personal
          ? t("My savings card", "Ikarita y’ubwizigame bwanjye")
          : t("Collective savings card", "Ikarita y’ubwizigame bw’ikimina")
      }
    >
      <svg className="savings-card-pattern" viewBox="0 0 360 227" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M270 -50C160 30 330 100 235 180S170 265 260 285M305 -50C195 30 365 100 270 180S205 265 295 285M340 -50C230 30 400 100 305 180S240 265 330 285"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
      <div className="savings-credit-card-header">
        <Image
          src="/images/elayo/logo-white.png"
          alt="Elayo Family"
          width={1403}
          height={463}
          unoptimized
          className="savings-card-logo"
        />
        {personal && (
          <button
            type="button"
            className="savings-card-visibility"
            aria-label={
              hidden ? t("Show savings balance", "Erekana ubwizigame") : t("Hide savings balance", "Hisha ubwizigame")
            }
            aria-pressed={hidden}
            onClick={props.onToggleVisibility}
          >
            {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
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
        <span>
          {personal ? t("MY SAVINGS BALANCE", "UBWIZIGAME BWANJYE") : t("COLLECTIVE SAVINGS", "UBWIZIGAME BW’IKIMINA")}
        </span>
        <h2>
          {hidden ? "••••••" : money(props.balance)}
          <small>RWF</small>
        </h2>
        <p>
          <ArrowUpRight size={13} />
          <b>{hidden ? "••••" : `+${money(props.added)}`}</b>
          <span>{t("this month", "uku kwezi")}</span>
        </p>
      </div>
      <div className="savings-credit-card-footer">
        <strong title={cardholder}>{cardholder}</strong>
        <div>
          {personal ? (
            <span>
              {props.memberId} · {money(SHARE_VALUE)} RWF {t("per share", "ku mugabane")}
            </span>
          ) : (
            <span>
              <Users size={12} />
              {props.memberCount} {t("members", "abanyamuryango")}
            </span>
          )}
          <span>
            <Coins size={12} />
            {hidden ? "••••" : money(props.shares)} {t("shares", "imigabane")}
          </span>
        </div>
      </div>
    </section>
  );
}
