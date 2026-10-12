"use client";

import { BrandLoader } from "@/components/brand-loader";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, Coins, Plus, Search, Users } from "lucide-react";
import {
  SHARE_VALUE,
  SOCIAL_MONTHLY,
  currentPeriod,
  kigaliTime,
  kigaliToday,
  money,
  type ContributionKind,
  type Member,
  type MemberRecord,
} from "@/lib/portal-data";
import { recordContribution } from "@/app/actions/portal";
import { findMembers } from "@/app/actions/lookup";
import { Action, MemberCode, useSharesLabel, useT } from "./portal-ui";
import { Choice } from "./ui/choice";
import { DateField, MonthField, TimeField } from "./ui/date-field";
import type { PenaltyAssessment } from "@/lib/penalty-types";
import { savingsContributionPeriod } from "@/lib/penalty-policy";

/** Finds members on the server as you type (only matching members are loaded). */
export function MemberPicker({
  selected,
  onChange,
}: {
  selected: Member | null;
  onChange: (member: Member | null) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [matching, setMatching] = useState<Member[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (selected) return;
    let active = true;
    const timer = setTimeout(
      () =>
        findMembers(query.trim()).then((found) => {
          if (active) setMatching(found);
        }),
      query ? 250 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, selected]);

  return (
    <fieldset className="member-picker">
      <legend>{t("Member", "Umunyamuryango")}</legend>
      {selected ? (
        <div className="member-picker-selected">
          <input
            className="sr-only"
            type="radio"
            name="member"
            value={selected.id}
            checked
            required
            readOnly
            tabIndex={-1}
            aria-label={selected.name}
          />
          <MemberCode code={selected.id} />
          <span>
            <strong>{selected.name}</strong>
            <small>{selected.district || selected.email || "—"}</small>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            {t("Change", "Hindura")}
          </button>
        </div>
      ) : (
        <>
          <label className="search-input" htmlFor={id}>
            <Search size={17} />
            <input
              id={id}
              ref={searchRef}
              type="search"
              autoComplete="off"
              aria-label={t("Search members", "Shaka abanyamuryango")}
              placeholder={t("Search name, member code or district…", "Shaka izina, inomero cyangwa akarere…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="member-picker-options" aria-label={t("Matching members", "Abanyamuryango babonetse")}>
            {matching === null ? (
              <p className="member-picker-empty">
                <BrandLoader size="small" label={t("Loading…", "Tegereza gato…")} />
              </p>
            ) : (
              matching.map((member) => (
                <label key={member.id} className="member-picker-option">
                  <input
                    type="radio"
                    name="member"
                    value={member.id}
                    checked={false}
                    required
                    onChange={() => onChange(member)}
                  />
                  <MemberCode code={member.id} />
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.district || member.email || "—"}</small>
                  </span>
                </label>
              ))
            )}
            {matching?.length === 0 && (
              <p className="member-picker-empty" role="status">
                <Users size={19} />
                {t(
                  "No members found. Try another name or code.",
                  "Nta munyamuryango wabonetse. Hindura izina cyangwa inomero.",
                )}
              </p>
            )}
          </div>
          <span className="member-picker-hint">
            {query
              ? t("Best matches · Select the person you’re recording for", "Abahuye cyane · Hitamo uwo wandikira")
              : t(
                  "Type a name or member code · Select the person you’re recording for",
                  "Andika izina cyangwa inomero · Hitamo uwo wandikira",
                )}
          </span>
        </>
      )}
    </fieldset>
  );
}

export function ContributionRecordingForm({
  kind,
  initialMemberId = "",
  socialMonthly = SOCIAL_MONTHLY,
  penalty,
  onSaved,
  onClose,
}: {
  kind: ContributionKind;
  initialMemberId?: string;
  socialMonthly?: number;
  penalty?: PenaltyAssessment;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const sharesLabel = useSharesLabel();
  const [selected, setSelected] = useState<Member | null>(null);
  const memberId = selected?.id ?? "";
  // Opened for a specific member (e.g. from a register row): look them up once.
  useEffect(() => {
    if (!initialMemberId) return;
    findMembers(initialMemberId).then((found) => setSelected(found.find((m) => m.id === initialMemberId) ?? null));
  }, [initialMemberId]);
  const formRef = useRef<HTMLFormElement>(null);
  const [shares, setShares] = useState("");
  const [amount, setAmount] = useState(
    penalty ? String(penalty.remaining) : kind === "social" ? String(socialMonthly) : "",
  );
  const [pending, start] = useTransition();
  const today = kigaliToday();
  const [saved, setSaved] = useState<MemberRecord | null>(null);
  const [error, setError] = useState("");
  const saving = kind === "savings";
  const shareCount = Number(shares);
  const calculated = Number.isFinite(shareCount) && shareCount > 0 ? shareCount * SHARE_VALUE : 0;
  useEffect(() => {
    if (!memberId) return;
    const timer = window.setTimeout(
      () => (formRef.current?.elements.namedItem(saving ? "shares" : "amount") as HTMLInputElement | null)?.focus(),
      50,
    );
    return () => window.clearTimeout(timer);
  }, [memberId, saving]);

  if (saved)
    return (
      <div className="record-success">
        <span>
          <Check size={32} />
        </span>
        <h3>{t("Contribution recorded", "Umusanzu wanditswe")}</h3>
        <strong>{saving ? sharesLabel(saved.amount / SHARE_VALUE) : `${money(saved.amount)} RWF`}</strong>
        {saving && (
          <p>
            {money(saved.amount)} RWF · {money(SHARE_VALUE)} RWF {t("per share", "ku mugabane")}
          </p>
        )}
        <p>{selected?.name}</p>
        <p className="mono">{saved.id}</p>
        <p className="muted">
          {penalty
            ? t("The payment has reduced the amount owed on this penalty.", "Ubwishyu bwagabanyije amande asigaye.")
            : t(
                "It now appears in its register, the member’s account and reports.",
                "Iyi nyandiko iri mu gitabo cyayo, muri konti y’umunyamuryango no muri raporo.",
              )}
        </p>
        <div className="record-success-actions">
          {!penalty && (
            <Action
              secondary
              onClick={() => {
                setSaved(null);
                setSelected(null);
                setShares("");
                setAmount(kind === "social" ? String(socialMonthly) : "");
                setError("");
              }}
            >
              <Plus size={16} />
              {t("Record another", "Andika undi")}
            </Action>
          )}
          <Action onClick={onClose}>
            {t("Done", "Birarangiye")}
            <ArrowRight size={16} />
          </Action>
        </div>
      </div>
    );

  return (
    <form
      ref={formRef}
      className="portal-form record-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected) {
          setError(t("Search for and select a member first.", "Banza ushake kandi uhitemo umunyamuryango."));
          return;
        }
        if (saving && (!Number.isSafeInteger(shareCount) || shareCount < 1 || shareCount > 20000)) {
          setError(
            t(
              "Enter a whole number of shares between 1 and 20,000.",
              "Andika umubare wuzuye w’imigabane hagati ya 1 na 20,000.",
            ),
          );
          return;
        }
        const paid = saving ? calculated : Number(amount);
        if (!Number.isFinite(paid) || paid <= 0 || paid > 100000000) {
          setError(
            t(
              "Enter an amount between 0.01 and 100,000,000 RWF.",
              "Andika amafaranga hagati ya 0.01 na 100,000,000 RWF.",
            ),
          );
          return;
        }
        const form = new FormData(event.currentTarget);
        const note = String(form.get("note") || "").trim();
        if (kind === "penalty" && !note) {
          setError(t("Enter the penalty reason or reference.", "Andika impamvu y’amande cyangwa inomero."));
          return;
        }
        start(async () => {
          const result = await recordContribution({
            memberId,
            kind,
            ...(saving ? { shares: shareCount } : { amount: paid }),
            period: String(form.get("period")),
            date: String(form.get("date")),
            time: String(form.get("time")),
            method: String(form.get("method")) as "Cash",
            note,
            ...(penalty ? { penaltyAssessmentId: penalty.id } : {}),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(result.record);
          onSaved();
        });
      }}
    >
      {kind === "penalty" && !penalty && (
        <p className="muted">
          {t(
            "Paying an assigned penalty? Use its Record payment button so the amount owed is updated.",
            "Wishyura amande yashyizweho? Koresha Andika ubwishyu kuri ayo mande kugira ngo asigaye avugururwe.",
          )}
        </p>
      )}
      {penalty ? (
        <div className="account-box">
          <strong>
            {penalty.memberName} · {penalty.memberCode}
          </strong>
          <span>{penalty.reason}</span>
          <small>
            {penalty.reference} · {money(penalty.remaining)} RWF {t("remaining", "asigaye")}
          </small>
        </div>
      ) : (
        <MemberPicker
          selected={selected}
          onChange={(member) => {
            setSelected(member);
            setError("");
          }}
        />
      )}
      {saving ? (
        <div className="share-entry">
          <label className="field">
            {t("Number of shares", "Umubare w’imigabane")}
            <input
              name="shares"
              type="number"
              inputMode="numeric"
              min="1"
              max="20000"
              step="1"
              placeholder="10"
              value={shares}
              onChange={(event) => {
                setShares(event.target.value);
                setError("");
              }}
              required
            />
          </label>
          <div className="share-shortcuts" aria-label={t("Quick share amounts", "Imibare y’imigabane yihuse")}>
            {[1, 5, 10, 20].map((count) => (
              <button
                type="button"
                key={count}
                aria-pressed={shares === String(count)}
                onClick={() => {
                  setShares(String(count));
                  setError("");
                }}
              >
                {count} {count === 1 ? t("share", "umugabane") : t("shares", "imigabane")}
              </button>
            ))}
          </div>
          <div className="share-calculation">
            <Coins size={22} />
            <div>
              <span>{t("Calculated contribution", "Agaciro k’umusanzu")}</span>
              <output aria-live="polite">
                {money(calculated)} <small>RWF</small>
              </output>
              <p>
                {t("1 share", "Umugabane 1")} = {money(SHARE_VALUE)} RWF
              </p>
            </div>
          </div>
          {selected && (
            <p className="share-commitment">
              {t("Monthly savings commitment", "Umusanzu w’ubwizigame wa buri kwezi")}:{" "}
              <strong>{sharesLabel(selected.monthlySavings / SHARE_VALUE)}</strong>
            </p>
          )}
        </div>
      ) : (
        <label className="field">
          {t("Amount (RWF)", "Amafaranga (RWF)")}
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            max="100000000"
            step="0.01"
            placeholder="1,000"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError("");
            }}
            required
          />
        </label>
      )}
      {penalty ? (
        <input type="hidden" name="period" value={penalty.period} />
      ) : (
        <div className="field">
          {t("Contribution month", "Ukwezi k’umusanzu")}
          <MonthField
            name="period"
            defaultValue={saving ? savingsContributionPeriod() : currentPeriod()}
            min="2019-01"
            ariaLabel={t("Contribution month", "Ukwezi k’umusanzu")}
          />
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          {t("Payment date", "Itariki y’ubwishyu")}
          <DateField
            name="date"
            defaultValue={today}
            min="2019-01-01"
            max={today}
            required
            ariaLabel={t("Payment date", "Itariki y’ubwishyu")}
          />
        </div>
        <div className="field">
          {t("Time (Kigali)", "Isaha (Kigali)")}
          <TimeField name="time" defaultValue={kigaliTime()} ariaLabel={t("Time (Kigali)", "Isaha (Kigali)")} />
        </div>
      </div>
      <div className="field">
        {t("Payment method", "Uburyo bwo kwishyura")}
        <Choice
          name="method"
          defaultValue="Mobile Money"
          ariaLabel={t("Payment method", "Uburyo bwo kwishyura")}
          options={["Mobile Money", "Bank transfer", "Cash"].map((m) => ({ value: m, label: m }))}
        />
      </div>
      <label className="field">
        {kind === "penalty"
          ? t("Penalty reason or reference", "Impamvu y’amande cyangwa inomero")
          : t("Reference or note", "Inomero cyangwa ibisobanuro")}
        <input
          name="note"
          defaultValue={penalty?.reason}
          maxLength={200}
          required={kind === "penalty"}
          placeholder={
            kind === "penalty"
              ? t("For example, a late meeting penalty", "Urugero: amande yo gukererwa inama")
              : t("Optional payment reference", "Inomero y’ubwishyu (si ngombwa)")
          }
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Action type="submit" disabled={!!penalty && !selected} busy={pending}>
        <Plus size={16} />
        {saving
          ? t("Record shares", "Andika imigabane")
          : kind === "social"
            ? t("Record social contribution", "Andika umusanzu w’ingoboka")
            : t("Record penalty payment", "Andika ubwishyu bw’amande")}
      </Action>
    </form>
  );
}
