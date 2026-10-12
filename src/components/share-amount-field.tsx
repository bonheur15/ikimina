"use client";

import { useId } from "react";
import { Coins, Minus, Plus } from "lucide-react";
import { money, SHARE_VALUE } from "@/lib/portal-data";
import { useT } from "./portal-ui";

export function ShareAmountField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const t = useT(),
    id = useId();
  const count = Number(value),
    valid = value !== "" && Number.isInteger(count) && count >= 1 && count <= 20000;
  const adjust = (by: number) => onChange(String(valid ? Math.min(20000, Math.max(1, count + by)) : 1));
  return (
    <div className="share-amount-field">
      <label className="field" htmlFor={id}>
        {t("Number of shares", "Umubare w’imigabane")}
      </label>
      <div className="share-count-control">
        <button
          type="button"
          aria-label={t("Decrease shares", "Gabanya imigabane")}
          disabled={!valid || count <= 1}
          onClick={() => adjust(-1)}
        >
          <Minus size={17} />
        </button>
        <input
          id={id}
          aria-label={ariaLabel ?? t("Number of shares", "Umubare w’imigabane")}
          aria-describedby={`${id}-value`}
          type="number"
          inputMode="numeric"
          min="1"
          max="20000"
          step="1"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={t("Increase shares", "Ongera imigabane")}
          disabled={valid && count >= 20000}
          onClick={() => adjust(1)}
        >
          <Plus size={17} />
        </button>
      </div>
      <div className="share-value-card" id={`${id}-value`}>
        <div>
          <span>{t("Savings contribution", "Umusanzu w’ubwizigame")}</span>
          <strong aria-live="polite" aria-atomic="true">
            {valid ? money(count * SHARE_VALUE) : "—"}
            <small>RWF</small>
          </strong>
          <p>
            {valid
              ? `${money(count)} × ${money(SHARE_VALUE)} ${t("RWF per share", "RWF ku mugabane")}`
              : t("Enter a whole number of shares", "Shyiramo umubare w’imigabane wuzuye")}
          </p>
        </div>
        <span className="share-value-icon" aria-hidden="true">
          <Coins size={23} />
        </span>
      </div>
    </div>
  );
}
