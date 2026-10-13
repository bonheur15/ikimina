"use client";

import { useEffect, useId, useState } from "react";
import { Coins } from "lucide-react";
import { getSavingsAllowance } from "@/app/actions/shares";
import { money, SHARE_VALUE } from "@/lib/portal-data";
import type { SavingsAllowance } from "@/lib/share-plans";
import { useSharesLabel, useT } from "./portal-ui";

/**
 * Savings toward a month's shares, in any amount up to what is left. The secretary sets the
 * shares; members fill them little by little.
 */
export function SavingsAmountField({
  period,
  value,
  onChange,
  ariaLabel,
}: {
  period: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const t = useT(),
    sharesLabel = useSharesLabel(),
    id = useId();
  const [allowance, setAllowance] = useState<SavingsAllowance | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getSavingsAllowance(period).then((result) => {
      if (!live) return;
      if (result.ok) {
        setAllowance(result.value);
        setError("");
      } else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [period]);
  if (error)
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    );
  if (!allowance || allowance.period !== period)
    return <p className="muted">{t("Checking this month’s savings…", "Turimo kureba ubwizigame bw’uku kwezi…")}</p>;
  if (!allowance.shares)
    return (
      <div className="finance-notice amber" role="status">
        <Coins size={20} />
        <p>
          {t(
            "Your monthly shares have not been set yet. Request them in My account; the secretary will confirm.",
            "Imigabane yawe ya buri kwezi ntirashyirwaho. Yisabe muri Konti yanjye; umunyamabanga azabyemeza.",
          )}
        </p>
      </div>
    );
  const amount = Number(value),
    left = allowance.remaining;
  const shortcuts = [...new Set([Math.min(SHARE_VALUE, left), Math.ceil(left / 2 / 100) * 100, left])].filter(
    (v) => v >= 100 && v <= left && (v === left || left - v >= 100),
  );
  return (
    <div className="share-amount-field">
      <div className="share-value-card">
        <div>
          <span>
            {t("This month’s target", "Intego y’uku kwezi")}: {sharesLabel(allowance.shares)}
          </span>
          <strong aria-live="polite" aria-atomic="true">
            {money(left)}
            <small>RWF {t("left", "bisigaye")}</small>
          </strong>
          <p>
            {money(allowance.paid)} {t("of", "kuri")} {money(allowance.target)} RWF {t("paid", "byishyuwe")}
            {allowance.pending > 0 &&
              ` · ${money(allowance.pending)} RWF ${t("awaiting confirmation", "bitegereje kwemezwa")}`}
          </p>
        </div>
        <span className="share-value-icon" aria-hidden="true">
          <Coins size={23} />
        </span>
      </div>
      {left > 0 && left < 100 ? (
        <p className="muted" role="status">
          {t(
            "Less than 100 RWF is left this month. Pay it to the secretary in cash.",
            "Hasigaye munsi ya 100 RWF uku kwezi. Yishyure umunyamabanga mu ntoki.",
          )}
        </p>
      ) : left > 0 ? (
        <>
          <label className="field" htmlFor={id}>
            {t("Amount to save now (RWF)", "Amafaranga uzigama ubu (RWF)")}
          </label>
          <input
            id={id}
            aria-label={ariaLabel ?? t("Savings amount", "Amafaranga y’ubwizigame")}
            type="number"
            inputMode="numeric"
            min="100"
            max={left}
            step="1"
            required
            placeholder={money(left)}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="share-shortcuts" aria-label={t("Quick amounts", "Amafaranga yihuse")}>
            {shortcuts.map((v) => (
              <button type="button" key={v} aria-pressed={amount === v} onClick={() => onChange(String(v))}>
                {v === left ? t("All that’s left", "Ibisigaye byose") : `${money(v)} RWF`}
              </button>
            ))}
          </div>
          <p className="muted">
            {t(
              "Pay any amount from 100 RWF. You can add the rest later this month.",
              "Ishyura amafaranga ayo ari yo yose guhera kuri 100 RWF. Ibisigaye wabyongeraho nyuma muri uku kwezi.",
            )}
          </p>
        </>
      ) : (
        <p className="form-success" role="status">
          {allowance.pending
            ? t(
                "This month’s savings are covered once your pending payments are confirmed.",
                "Ubwizigame bw’uku kwezi buzaba bwuzuye ubwishyu butegereje nibumara kwemezwa.",
              )
            : t("This month’s savings are complete. Thank you!", "Ubwizigame bw’uku kwezi bwuzuye. Murakoze!")}
        </p>
      )}
    </div>
  );
}
