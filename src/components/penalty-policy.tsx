"use client";

import { canEditRecords } from "@/lib/permissions";
import { useState, useTransition } from "react";
import { Check, ChevronDown, Clock, ShieldCheck } from "lucide-react";
import {
  checkPenaltiesNow,
  requestPenaltyDelay,
  reviewPenaltyDelay,
  savePenaltyPolicy,
} from "@/app/actions/penalty-policy";
import type { MemberPenaltyPlan, PenaltyAutomationData } from "@/lib/penalty-automation";
import { addDays, savingsContributionPeriod, savingsWindow } from "@/lib/penalty-policy";
import { currentPeriod, kigaliToday } from "@/lib/portal-data";
import { usePortal, useWorkspace } from "./account-dashboard";
import { Action, SectionHeading, useDateLabel, useT } from "./portal-ui";
import { Choice } from "./ui/choice";
import { DateField, MonthField } from "./ui/date-field";
import { PushNotificationButton } from "./push-notifications";

export function PenaltyPolicyPanel({ data }: { data: PenaltyAutomationData }) {
  const t = useT(),
    dateLabel = useDateLabel(),
    { refresh } = useWorkspace();
  const { viewer } = usePortal();
  const editable = canEditRecords(viewer.role);
  const [pending, start] = useTransition(),
    [message, setMessage] = useState("");
  const [review, setReview] = useState<PenaltyAutomationData["requests"][number] | null>(null);
  const [basis, setBasis] = useState(data.policy.basis),
    [pause, setPause] = useState(data.policy.pausePending);
  return (
    <section className="panel penalty-policy-panel">
      <SectionHeading
        title={t("Automatic savings penalties", "Amande y’ubwizigame yikora")}
        subtitle={t(
          "20th–10th savings window · 500 RWF per share per day · maximum 10 charged days",
          "Ubwizigame kuva ku wa 20 kugeza ku wa 10 · 500 RWF ku mugabane buri munsi · ntarenza iminsi 10",
        )}
      />
      <p className="penalty-policy-status">
        <ShieldCheck size={17} />
        {data.policy.enabled
          ? t("Automation enabled", "Amande yikora arakora")
          : t("Automation paused", "Amande yikora ahagaritswe")}{" "}
        · {t("Starts with", "Atangirana na")} {dateLabel(data.policy.effectivePeriod, true)}
      </p>
      {viewer.role === "superadmin" && (
        <form
          className="portal-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              try {
                const r = await savePenaltyPolicy({
                  enabled: f.get("enabled") === "on",
                  effectivePeriod: String(f.get("effectivePeriod")),
                  basis,
                  pausePending: pause,
                });
                setMessage(r.ok ? t("Penalty rule saved.", "Amabwiriza y’amande yabitswe.") : r.error);
                if (r.ok) refresh();
              } catch {
                setMessage(t("Settings could not be saved. Try again.", "Amabwiriza ntiyabitswe. Ongera ugerageze."));
              }
            });
          }}
        >
          <div className="form-grid">
            <div className="field">
              {t("First savings month", "Ukwezi gutangira")}
              <MonthField
                name="effectivePeriod"
                defaultValue={data.policy.effectivePeriod}
                min={currentPeriod()}
                ariaLabel={t("First savings month", "Ukwezi gutangira")}
              />
            </div>
            <div className="field">
              {t("Shares charged", "Imigabane ibarwaho amande")}
              <Choice
                value={basis}
                onChange={(v) => setBasis(v as typeof basis)}
                ariaLabel={t("Shares charged", "Imigabane ibarwaho amande")}
                options={[
                  { value: "unpaid", label: t("Only unpaid shares", "Imigabane itarishyuwe gusa") },
                  { value: "committed", label: t("All committed shares", "Imigabane yose yemejwe") },
                ]}
              />
            </div>
          </div>
          <label className="penalty-check">
            <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} />
            {t("Pause new charges while a reason awaits review", "Hagarika amande mashya mu gihe impamvu itarasuzumwa")}
          </label>
          <label className="penalty-check">
            <input name="enabled" type="checkbox" defaultChecked={data.policy.enabled} />
            {t(
              "Enable automatic penalties for active members with confirmed monthly shares",
              "Emera amande yikora ku banyamuryango bafite imigabane ya buri kwezi yemejwe",
            )}
          </label>
          <p className="muted">
            {t(
              "Confirm monthly commitments in Members before enabling. Invalid or missing share commitments are skipped. Each window keeps its original share commitment; historical months are not backfilled.",
              "Emeza imigabane ya buri kwezi mu Banyamuryango mbere yo gutangira. Imigabane itari yo cyangwa itashyizweho ntibarwa. Iya kera ntihindurwa.",
            )}
          </p>
          <div className="heading-actions">
            <Action type="submit" busy={pending}>
              <Check size={15} />
              {t("Save rule", "Bika amabwiriza")}
            </Action>
            <Action
              secondary
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    const r = await checkPenaltiesNow();
                    setMessage(t(`${r.created} new daily penalties added.`, `Amande mashya ${r.created} yashyizweho.`));
                    refresh();
                  } catch {
                    setMessage(t("The check failed. Please try again.", "Igenzura ntiryakunze. Ongera ugerageze."));
                  }
                })
              }
            >
              {t("Check now", "Genzura ubu")}
            </Action>
          </div>
        </form>
      )}
      <p className="muted">
        {data.pushConfigured
          ? t(
              "OneSignal configured. Members must enable browser notifications.",
              "OneSignal yashyizweho. Abanyamuryango bagomba kwemera imenyesha.",
            )
          : t(
              "OneSignal setup is pending: add the App ID and server API key to enable push delivery.",
              "OneSignal iracyategurwa: shyiramo App ID na API key kugira ngo imenyesha ritangire.",
            )}
      </p>
      <PushNotificationButton />
      {message && (
        <p role="status" className="penalty-policy-message">
          {message}
        </p>
      )}
      <SectionHeading title={t("Savings delay requests", "Ubusabe bwo gutinza ubwishyu")} />
      {!data.requests.length && <p className="muted">{t("No reasons submitted yet.", "Nta mpamvu ziratangazwa.")}</p>}
      {data.requests.map((r) => (
        <div key={r.id} className="delay-request-row">
          <div>
            <strong>
              {r.memberName} · {r.memberCode}
            </strong>
            <small>
              {dateLabel(r.period, true)} · {t("Requested until", "Asaba kugeza ku wa")} {dateLabel(r.requestedUntil)}
            </small>
            <p>{r.reason}</p>
            <small>
              {r.status === "pending"
                ? t("Awaiting review", "Buracyasuzumwa")
                : r.status === "approved"
                  ? `${t("Approved until", "Bwemewe kugeza ku wa")} ${dateLabel(r.deferredUntil!)}`
                  : t("Declined", "Bwanze")}
            </small>
            {r.reviewNote && <p>{r.reviewNote}</p>}
          </div>
          {editable && r.status === "pending" && (
            <Action secondary onClick={() => setReview(r)}>
              {t("Review", "Suzuma")}
            </Action>
          )}
        </div>
      ))}
      {review && (
        <form
          className="portal-form penalty-review-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              try {
                const r = await reviewPenaltyDelay({
                  id: review.id,
                  approved: f.get("decision") === "approve",
                  deferredUntil: String(f.get("deferredUntil")),
                  note: String(f.get("note")),
                });
                if (!r.ok) {
                  setMessage(r.error);
                  return;
                }
                setReview(null);
                setMessage(t("Review saved.", "Isuzuma ryabitswe."));
                refresh();
              } catch {
                setMessage(t("The review could not be saved.", "Isuzuma ntiryabitswe."));
              }
            });
          }}
        >
          <strong>
            {review.memberName} · {dateLabel(review.period, true)}
          </strong>
          <Choice
            name="decision"
            defaultValue="approve"
            ariaLabel={t("Decision", "Icyemezo")}
            options={[
              { value: "approve", label: t("Approve delay", "Emera ubusabe") },
              { value: "reject", label: t("Decline", "Hakana") },
            ]}
          />
          <div className="field">
            {t("New deadline", "Itariki nshya ntarengwa")}
            <DateField
              name="deferredUntil"
              defaultValue={review.requestedUntil >= kigaliToday() ? review.requestedUntil : kigaliToday()}
              min={kigaliToday()}
              ariaLabel={t("New deadline", "Itariki nshya ntarengwa")}
            />
          </div>
          <label className="field">
            {t("Review note", "Ibisobanuro by’isuzuma")}
            <input name="note" required minLength={3} maxLength={300} />
          </label>
          <div className="heading-actions">
            <Action type="submit" busy={pending}>
              {t("Save decision", "Bika icyemezo")}
            </Action>
            <Action secondary onClick={() => setReview(null)}>
              {t("Cancel", "Reka")}
            </Action>
          </div>
        </form>
      )}
    </section>
  );
}

export function MemberSavingsWindow({ plan }: { plan: MemberPenaltyPlan }) {
  const t = useT(),
    dateLabel = useDateLabel(),
    { refresh } = useWorkspace(),
    { viewer } = usePortal();
  const [requesting, setRequesting] = useState(false),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const defaultPeriod = [savingsContributionPeriod(), plan.policy.effectivePeriod].sort().at(-1)!;
  const [period, setPeriod] = useState(defaultPeriod);
  const window = savingsWindow(period),
    request = plan.requests.find((r) => r.period === period);
  const cycle = plan.cycles.find((c) => c.period === period);
  const months = [...new Set([defaultPeriod, currentPeriod(), ...plan.cycles.map((c) => c.period)])]
    .filter((p) => p >= plan.policy.effectivePeriod)
    .sort()
    .reverse();
  return (
    <section className="panel member-savings-window" aria-label={t("Your savings window", "Igihe cy’ubwizigame bwawe")}>
      <div className="savings-window-heading">
        <div className="member-card-heading">
          <span className="member-card-icon">
            <Clock size={20} />
          </span>
          <h2>{t("Your savings window", "Igihe cy’ubwizigame bwawe")}</h2>
        </div>
        {!plan.policy.enabled && (
          <span className="savings-window-status">{t("Charges paused", "Amande ahagaritswe")}</span>
        )}
      </div>
      <div className="savings-window-dates">
        <span>{t("Contribution period", "Igihe cyo gutanga umusanzu")}</span>
        <strong>
          {dateLabel(window.startsOn)}
          <span aria-hidden="true"> – </span>
          {dateLabel(window.dueOn)}
        </strong>
      </div>
      <p className="savings-window-rule">
        {plan.policy.basis === "unpaid"
          ? t(
              "After the 10th, unpaid shares incur 500 RWF per share each day, for up to 10 charged days.",
              "Nyuma y’itariki 10, umugabane utarishyuwe ucibwa 500 RWF buri munsi, ntarenza iminsi 10.",
            )
          : t(
              "After the 10th, each committed share incurs 500 RWF a day until paid, for up to 10 charged days.",
              "Nyuma y’itariki 10, umugabane wemejwe ucibwa 500 RWF buri munsi kugeza wishyuwe, ntarenza iminsi 10.",
            )}
      </p>
      <details className="savings-window-details">
        <summary>
          {t("How late charges work", "Uko amande yo gutinda abarwa")}
          <ChevronDown size={14} />
        </summary>
        <div>
          <p>{t("Payments made today stop the next day’s charge.", "Ubwishyu bwa none buhagarika amande y’ejo.")}</p>
          {plan.policy.basis === "unpaid" && (
            <p>
              {t(
                "A partly unpaid share counts as one unpaid share.",
                "Umugabane wishyuwe igice ubarwa nk’umwe utarishyuwe.",
              )}
            </p>
          )}
          {!plan.policy.enabled && (
            <p>
              {t(
                "Automatic charges are currently paused by your administrator.",
                "Amande yikora ahagaritswe n’umuyobozi.",
              )}
            </p>
          )}
          {cycle && (
            <p>
              {t(
                `${cycle.chargedDays} of 10 charged days used for this savings month.`,
                `Habaruwe iminsi ${cycle.chargedDays} kuri 10 muri uku kwezi k’ubwizigame.`,
              )}
            </p>
          )}
        </div>
      </details>
      <div className="savings-window-controls">
        <div className="field">
          {t("Savings month", "Ukwezi k’ubwizigame")}
          <Choice
            value={period}
            onChange={(v) => {
              setPeriod(v);
              setRequesting(false);
              setError("");
            }}
            ariaLabel={t("Savings month", "Ukwezi k’ubwizigame")}
            options={months.map((p) => ({ value: p, label: dateLabel(p, true) }))}
          />
        </div>
        {!request && viewer.memberCode && (
          <Action
            secondary
            onClick={() => {
              setRequesting((v) => !v);
              setError("");
            }}
          >
            {requesting ? t("Cancel request", "Reka ubusabe") : t("Request more time", "Saba ikindi gihe")}
          </Action>
        )}
      </div>
      {request && (
        <div className="delay-status">
          <strong>
            {request.status === "pending"
              ? t("Your reason is awaiting review", "Impamvu yawe iracyasuzumwa")
              : request.status === "approved"
                ? `${t("New deadline", "Itariki nshya ntarengwa")}: ${dateLabel(request.deferredUntil!)}`
                : t("Your request was declined", "Ubusabe bwawe bwanze")}
          </strong>
          <p>{request.reason}</p>
          {request.reviewNote && <p>{request.reviewNote}</p>}
          {request.status === "pending" && (
            <p>
              {plan.policy.pausePending
                ? t(
                    "New charges pause while the administrator reviews your reason.",
                    "Amande mashya arahagarara mu gihe umuyobozi asuzuma impamvu yawe.",
                  )
                : t(
                    "Daily charges continue while your reason is awaiting review.",
                    "Amande ya buri munsi arakomeza mu gihe impamvu yawe itarasuzumwa.",
                  )}
            </p>
          )}
          {request.status === "approved" && (
            <p>
              {t(
                "If shares remain unpaid, charges resume the day after this deadline.",
                "Imigabane nitarishyurwa, amande azakomeza umunsi ukurikira iyi tariki.",
              )}
            </p>
          )}
        </div>
      )}
      {requesting && !request && (
        <form
          className="portal-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              try {
                const r = await requestPenaltyDelay({
                  period,
                  reason: String(f.get("reason")),
                  requestedUntil: String(f.get("requestedUntil")),
                });
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setRequesting(false);
                refresh();
              } catch {
                setError(
                  t("Your reason could not be submitted. Try again.", "Impamvu yawe ntiyatanzwe. Ongera ugerageze."),
                );
              }
            });
          }}
        >
          <label className="field">
            {t("Reason", "Impamvu")}
            <textarea name="reason" required minLength={10} maxLength={500} rows={3} />
          </label>
          <div className="field">
            {t("When can you pay?", "Washobora kwishyura ryari?")}
            <DateField
              name="requestedUntil"
              defaultValue={addDays([window.dueOn, kigaliToday()].sort().at(-1)!, 1)}
              min={addDays(window.dueOn, 1)}
              required
              ariaLabel={t("When can you pay?", "Washobora kwishyura ryari?")}
            />
          </div>
          <p className="muted">
            {t(
              "The administrator will review your reason. Existing penalties remain until they are cancelled separately.",
              "Umuyobozi azasuzuma impamvu yawe. Amande yariho akomeza kubaho kugeza akuweho ukwawo.",
            )}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Action type="submit" busy={pending}>
            {t("Send reason for review", "Ohereza impamvu isuzumwe")}
          </Action>
        </form>
      )}
      <PushNotificationButton />
    </section>
  );
}
