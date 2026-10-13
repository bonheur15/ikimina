"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Clock, Coins, X } from "lucide-react";
import {
  cancelShareRequest,
  getMemberSharePlan,
  getOwnSharePlan,
  listShareRequests,
  requestShareChange,
  reviewShareRequest,
  setMemberShares,
} from "@/app/actions/shares";
import { savingsContributionPeriod } from "@/lib/penalty-policy";
import { money, SHARE_VALUE } from "@/lib/portal-data";
import type { SharePlan } from "@/lib/share-plans";
import { Action, SectionHeading, useDateLabel, useSharesLabel, useT } from "./portal-ui";
import { MonthField } from "./ui/date-field";

type Request = SharePlan["requests"][number];
type Pending = Extract<Awaited<ReturnType<typeof listShareRequests>>, { ok: true }>["value"][number];

function nextMonth(period: string, by = 1) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
/** Share changes start from the current savings window; by default the next one. */
const firstPeriod = () => savingsContributionPeriod();
const defaultStart = () => nextMonth(firstPeriod());

function useOperation(onDone: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setError("");
      setMessage("");
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not complete this request.");
      else {
        setMessage(success);
        onDone();
      }
    });
  const feedback = (
    <>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success">
          {message}
        </p>
      )}
    </>
  );
  return { pending, run, feedback };
}
function useSharePlan(load: () => Promise<{ ok: true; value: SharePlan } | { ok: false; error: string }>) {
  const [plan, setPlan] = useState<SharePlan | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    load().then((result) => {
      if (result.ok) setPlan(result.value);
      else setError(result.error);
    });
  }, [load]);
  useEffect(refresh, [refresh]);
  return { plan, error, refresh };
}

function ShareSummary({ plan }: { plan: SharePlan }) {
  const t = useT(),
    sharesLabel = useSharesLabel(),
    dateLabel = useDateLabel();
  return (
    <dl className="detail-list">
      <div>
        <dt>{t("Monthly shares", "Imigabane ya buri kwezi")}</dt>
        <dd>
          {plan.shares
            ? `${sharesLabel(plan.shares)} · ${money(plan.shares * SHARE_VALUE)} RWF`
            : t("Not set", "Ntibirashyirwaho")}
        </dd>
      </div>
      {plan.upcoming.map((u) => (
        <div key={u.effectivePeriod}>
          <dt>
            {t("From", "Guhera")} {dateLabel(u.effectivePeriod, true)}
          </dt>
          <dd>
            {u.shares
              ? `${sharesLabel(u.shares)} · ${money(u.shares * SHARE_VALUE)} RWF`
              : t("No savings target", "Nta ntego y’ubwizigame")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function RequestLine({ request }: { request: Request }) {
  const t = useT(),
    sharesLabel = useSharesLabel(),
    dateLabel = useDateLabel();
  const status = {
    pending: t("Waiting for the secretary", "Bitegereje umunyamabanga"),
    approved: `${t("Approved from", "Byemejwe guhera")} ${request.effectivePeriod ? dateLabel(request.effectivePeriod, true) : ""}`,
    rejected: t("Declined", "Byanzwe"),
    cancelled: t("Cancelled", "Byahagaritswe"),
  }[request.status];
  return (
    <p className="muted">
      <strong>
        {sharesLabel(request.currentShares)} → {sharesLabel(request.requestedShares)}
      </strong>{" "}
      · {status}
      {request.reviewNote ? ` · “${request.reviewNote}”` : ""}
    </p>
  );
}

/** The member's own shares: read-only, with a request to the secretary to change them. */
export function MemberSharesCard() {
  const t = useT();
  const { plan, error, refresh } = useSharePlan(getOwnSharePlan);
  const op = useOperation(refresh);
  const [shares, setShares] = useState("");
  const [reason, setReason] = useState("");
  if (error) return null;
  const pending = plan?.requests.find((r) => r.status === "pending");
  const latest = plan?.requests.find((r) => r.status !== "pending" && r.status !== "cancelled");
  return (
    <section className="panel">
      <SectionHeading
        title={t("My shares", "Imigabane yanjye")}
        subtitle={t(
          "The secretary sets your monthly shares. You can pay them little by little during the month.",
          "Umunyamabanga ni we ushyiraho imigabane yawe ya buri kwezi. Ushobora kuyishyura buhoro buhoro mu kwezi.",
        )}
      />
      {!plan ? (
        <p className="muted">{t("Loading…", "Tegereza gato…")}</p>
      ) : (
        <>
          <ShareSummary plan={plan} />
          {latest && <RequestLine request={latest} />}
          {pending ? (
            <div className="finance-notice amber" role="status">
              <Clock size={20} />
              <div>
                <RequestLine request={pending} />
                <button
                  type="button"
                  className="text-action danger-text"
                  disabled={op.pending}
                  onClick={() =>
                    op.run(() => cancelShareRequest(pending.id), t("Request cancelled.", "Ubusabe bwahagaritswe."))
                  }
                >
                  <X size={14} />
                  {t("Cancel request", "Hagarika ubusabe")}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="portal-form"
              onSubmit={(e) => {
                e.preventDefault();
                op.run(
                  async () => {
                    const result = await requestShareChange({ shares: Number(shares), reason });
                    if (result.ok) {
                      setShares("");
                      setReason("");
                    }
                    return result;
                  },
                  t("Request sent to the secretary.", "Ubusabe bwoherejwe ku munyamabanga."),
                );
              }}
            >
              <div className="form-grid">
                <label className="field">
                  {plan.shares
                    ? t("New number of shares per month", "Umubare mushya w’imigabane buri kwezi")
                    : t("Shares per month", "Imigabane buri kwezi")}
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="1000"
                    step="1"
                    required
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("Reason", "Impamvu")}
                  <input
                    required
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </div>
              {Number(shares) > 0 && (
                <p className="muted">
                  = {money(Number(shares) * SHARE_VALUE)} RWF {t("per month", "buri kwezi")}
                </p>
              )}
              <Action type="submit" secondary busy={op.pending}>
                {plan.shares
                  ? t("Request a share change", "Saba guhindura imigabane")
                  : t("Request my shares", "Saba imigabane yanjye")}
              </Action>
            </form>
          )}
          {op.feedback}
        </>
      )}
    </section>
  );
}

/** Secretary view inside a member's sheet: current shares, any request to review, and a direct change. */
export function MemberSharesAdmin({
  code,
  editable,
  onChanged,
}: {
  code: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const load = useCallback(() => getMemberSharePlan(code), [code]);
  const { plan, error, refresh } = useSharePlan(load);
  const done = () => {
    refresh();
    onChanged();
  };
  const review = useOperation(done);
  const change = useOperation(done);
  const [start, setStart] = useState(defaultStart);
  const [note, setNote] = useState("");
  const [shares, setShares] = useState("");
  const [from, setFrom] = useState(defaultStart);
  if (error) return null;
  const pending = plan?.requests.find((r) => r.status === "pending");
  return (
    <section className="account-box">
      <SectionHeading
        title={t("Monthly shares", "Imigabane ya buri kwezi")}
        subtitle={t(
          "Only the secretary changes shares. Members pay toward them in any amount during the month.",
          "Umunyamabanga wenyine ni we uhindura imigabane. Abanyamuryango bayishyura mu mafaranga ayo ari yo yose mu kwezi.",
        )}
      />
      {!plan ? (
        <p className="muted">{t("Loading…", "Tegereza gato…")}</p>
      ) : (
        <>
          <ShareSummary plan={plan} />
          {pending && (
            <div className="finance-notice amber" role="status">
              <Coins size={20} />
              <div>
                <RequestLine request={pending} />
                <p className="muted">“{pending.reason}”</p>
                {editable && (
                  <div className="portal-form">
                    <div className="form-grid">
                      <div className="field">
                        {t("Starting month", "Ukwezi bitangiriraho")}
                        <MonthField
                          value={start}
                          onChange={setStart}
                          min={firstPeriod()}
                          max={nextMonth(firstPeriod(), 24)}
                          ariaLabel={t("Starting month", "Ukwezi bitangiriraho")}
                        />
                      </div>
                      <label className="field">
                        {t("Note to the member", "Ubutumwa ku munyamuryango")}
                        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                      </label>
                    </div>
                    <div className="record-success-actions">
                      <Action
                        secondary
                        busy={review.pending}
                        onClick={() =>
                          review.run(
                            () => reviewShareRequest({ id: pending.id, approved: false, effectivePeriod: "", note }),
                            t("Request declined.", "Ubusabe bwanzwe."),
                          )
                        }
                      >
                        <X size={15} />
                        {t("Decline", "Anga")}
                      </Action>
                      <Action
                        busy={review.pending}
                        onClick={() =>
                          review.run(
                            () => reviewShareRequest({ id: pending.id, approved: true, effectivePeriod: start, note }),
                            t("Shares updated.", "Imigabane yavuguruwe."),
                          )
                        }
                      >
                        <Check size={15} />
                        {t("Approve", "Emeza")}
                      </Action>
                    </div>
                  </div>
                )}
                {review.feedback}
              </div>
            </div>
          )}
          {editable && (
            <form
              className="portal-form"
              onSubmit={(e) => {
                e.preventDefault();
                change.run(
                  async () => {
                    const result = await setMemberShares({ code, shares: Number(shares), effectivePeriod: from });
                    if (result.ok) setShares("");
                    return result;
                  },
                  t("Shares updated.", "Imigabane yavuguruwe."),
                );
              }}
            >
              <div className="form-grid">
                <label className="field">
                  {t("Set shares per month", "Shyiraho imigabane buri kwezi")}
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="1000"
                    step="1"
                    required
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                  />
                </label>
                <div className="field">
                  {t("Starting month", "Ukwezi bitangiriraho")}
                  <MonthField
                    value={from}
                    onChange={setFrom}
                    min={firstPeriod()}
                    max={nextMonth(firstPeriod(), 24)}
                    ariaLabel={t("Shares starting month", "Ukwezi imigabane itangiriraho")}
                  />
                </div>
              </div>
              {shares !== "" && (
                <p className="muted">
                  = {money(Number(shares) * SHARE_VALUE)} RWF {t("per month", "buri kwezi")}
                  {Number(shares) === 0 && ` · ${t("no savings target", "nta ntego y’ubwizigame")}`}
                </p>
              )}
              <Action type="submit" secondary busy={change.pending}>
                {t("Save shares", "Bika imigabane")}
              </Action>
              {change.feedback}
            </form>
          )}
        </>
      )}
    </section>
  );
}

/** Pending share requests across the group, shown on the secretary's members page. */
export function ShareRequestsPanel({ onOpen }: { onOpen: (code: string) => void }) {
  const t = useT(),
    sharesLabel = useSharesLabel();
  const [requests, setRequests] = useState<Pending[]>([]);
  useEffect(() => {
    listShareRequests().then((result) => result.ok && setRequests(result.value));
  }, []);
  if (!requests.length) return null;
  return (
    <section className="panel finance-section">
      <SectionHeading
        title={t("Share change requests", "Ubusabe bwo guhindura imigabane")}
        subtitle={t("Open a member to approve or decline.", "Fungura umunyamuryango kugira ngo wemeze cyangwa wange.")}
      />
      {requests.map((r) => (
        <article key={r.id} className="finance-record">
          <div>
            <strong>
              {[r.firstName, r.surname].filter(Boolean).join(" ")} · {r.code}
            </strong>
            <small>
              {sharesLabel(r.currentShares)} → {sharesLabel(r.requestedShares)} · “{r.reason}”
            </small>
          </div>
          <Action secondary onClick={() => onOpen(r.code)}>
            {t("Review", "Suzuma")}
          </Action>
        </article>
      ))}
    </section>
  );
}
