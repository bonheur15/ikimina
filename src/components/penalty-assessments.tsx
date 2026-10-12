"use client";

import { useState, useTransition } from "react";
import { Check, Plus, ShieldCheck, X } from "lucide-react";
import { addPenaltyAssessment, cancelPenaltyAssessment } from "@/app/actions/penalties";
import { currentPeriod, kigaliToday, money, type Member } from "@/lib/portal-data";
import type { PenaltyAssessment, PenaltyAssessmentData } from "@/lib/penalty-types";
import { canEditRecords } from "@/lib/permissions";
import { usePortal, useWorkspace } from "./account-dashboard";
import { ContributionRecordingForm, MemberPicker } from "./contribution-recording";
import { Action, EmptyState, MemberCode, Money, SectionHeading, useDateLabel, useT } from "./portal-ui";
import { Pager, useUrlState } from "./url-state";
import { Choice } from "./ui/choice";
import { DateField, MonthField } from "./ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

function AssessmentForm({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const t = useT();
  const [member, setMember] = useState<Member | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  if (saved)
    return (
      <div className="record-success">
        <span>
          <Check size={32} />
        </span>
        <h3>{t("Penalty assigned", "Amande yashyizweho")}</h3>
        <p>{member?.name}</p>
        <p className="mono">{saved}</p>
        <p>
          {t(
            "The member now owes this amount. No payment has been recorded.",
            "Umuryango asabwa kwishyura aya mande. Nta bwishyu bwanditswe.",
          )}
        </p>
        <Action onClick={onClose}>{t("Done", "Birarangiye")}</Action>
      </div>
    );
  return (
    <form
      className="portal-form record-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!member) {
          setError(t("Select a member first.", "Banza uhitemo umunyamuryango."));
          return;
        }
        const form = new FormData(event.currentTarget);
        setError("");
        start(async () => {
          try {
            const result = await addPenaltyAssessment({
              memberCode: member.id,
              amount: Number(form.get("amount")),
              period: String(form.get("period")),
              assessedOn: String(form.get("assessedOn")),
              reason: String(form.get("reason")),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setSaved(result.reference);
            onSaved();
          } catch {
            setError(t("The penalty could not be saved. Please try again.", "Amande ntiyabitswe. Ongera ugerageze."));
          }
        });
      }}
    >
      <MemberPicker selected={member} onChange={setMember} />
      <label className="field">
        {t("Penalty amount (RWF)", "Amafaranga y’amande (RWF)")}
        <input name="amount" type="number" min="0.01" max="100000000" step="0.01" defaultValue="500" required />
      </label>
      <div className="field">
        {t("Contribution month", "Ukwezi k’umusanzu")}
        <MonthField
          name="period"
          defaultValue={currentPeriod()}
          min="2019-01"
          ariaLabel={t("Contribution month", "Ukwezi k’umusanzu")}
        />
      </div>
      <div className="field">
        {t("Issue date", "Itariki amande yashyiriweho")}
        <DateField
          name="assessedOn"
          defaultValue={kigaliToday()}
          max={kigaliToday()}
          required
          ariaLabel={t("Issue date", "Itariki amande yashyiriweho")}
        />
      </div>
      <label className="field">
        {t("Reason", "Impamvu")}
        <input
          name="reason"
          required
          minLength={3}
          maxLength={200}
          placeholder={t("For example, late savings contribution", "Urugero: gutinda gutanga umusanzu w’ubwizigame")}
        />
      </label>
      <p className="muted">
        {t(
          "This adds an amount owed. Record a payment when the member pays.",
          "Aya ni amande asabwa. Andika ubwishyu umunyamuryango amaze kwishyura.",
        )}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Action type="submit" busy={pending}>
        <Plus size={16} />
        {t("Add unpaid penalty", "Shyiraho amande atarishyurwa")}
      </Action>
    </form>
  );
}

export function PenaltyAssessmentsPanel({ data }: { data: PenaltyAssessmentData }) {
  const t = useT(),
    dateLabel = useDateLabel();
  const editable = canEditRecords(usePortal().viewer.role);
  const { refresh } = useWorkspace();
  const url = useUrlState();
  const [adding, setAdding] = useState(false);
  const [payment, setPayment] = useState<PenaltyAssessment | null>(null);
  const [cancelling, setCancelling] = useState<PenaltyAssessment | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="panel penalty-assessments">
      <SectionHeading
        title={t("Assigned penalties", "Amande yashyizweho")}
        subtitle={t(
          "Track what members owe separately from money received.",
          "Kurikirana amande asabwa ukwawo n’amafaranga yakiriwe.",
        )}
        action={
          editable ? (
            <Action onClick={() => setAdding(true)}>
              <Plus size={16} />
              {t("Add unpaid penalty", "Shyiraho amande atarishyurwa")}
            </Action>
          ) : undefined
        }
      />
      <div className="penalty-balance">
        <ShieldCheck size={20} />
        <div>
          <span>{t("Still to pay", "Asigaye kwishyurwa")}</span>
          <strong>
            <Money amount={data.outstanding} />
          </strong>
          <small>
            {data.outstandingCount} {t("unpaid penalties · current filters", "amande atarishyurwa · ibyo wahisemo")}
          </small>
        </div>
        <Choice
          size="sm"
          ariaLabel={t("Penalty status", "Uko amande ahagaze")}
          value={data.status}
          onChange={(status) =>
            url.set(
              { penaltyStatus: status === "outstanding" ? null : status, penaltyPage: null },
              { resetPage: false },
            )
          }
          options={[
            { value: "outstanding", label: t("Unpaid / partial", "Atarishyurwa / igice") },
            { value: "settled", label: t("Paid", "Yishyuwe") },
            { value: "all", label: t("All assigned", "Yose yashyizweho") },
          ]}
        />
      </div>
      {data.page.rows.length ? (
        <div className="table-wrap">
          <table className="record-table penalty-table">
            <thead>
              <tr>
                <th>{t("Member", "Umunyamuryango")}</th>
                <th>{t("Penalty", "Amande")}</th>
                <th>{t("Amount", "Amafaranga")}</th>
                <th>{t("Paid", "Yishyuwe")}</th>
                <th>{t("Remaining", "Asigaye")}</th>
                <th>{t("Actions", "Ibikorwa")}</th>
              </tr>
            </thead>
            <tbody>
              {data.page.rows.map((penalty) => (
                <tr key={penalty.id}>
                  <td data-label={t("Member", "Umunyamuryango")}>
                    <div>
                      <strong>{penalty.memberName}</strong>
                      <small>
                        <MemberCode code={penalty.memberCode} />
                      </small>
                    </div>
                  </td>
                  <td data-label={t("Penalty", "Amande")}>
                    <div>
                      <strong>{penalty.reason}</strong>
                      <small>
                        {dateLabel(penalty.period, true)} · {dateLabel(penalty.assessedOn)}
                      </small>
                      <small className="mono">{penalty.reference}</small>
                    </div>
                  </td>
                  <td data-label={t("Amount", "Amafaranga")}>{money(penalty.amount)} RWF</td>
                  <td data-label={t("Paid", "Yishyuwe")}>{money(penalty.paid)} RWF</td>
                  <td data-label={t("Remaining", "Asigaye")}>
                    <div>
                      <strong>{money(penalty.remaining)} RWF</strong>
                      <small>
                        {penalty.remaining === 0
                          ? t("Paid", "Yishyuwe")
                          : penalty.paid > 0
                            ? t("Partly paid", "Yishyuwe igice")
                            : t("Unpaid", "Ntarishyurwa")}
                      </small>
                    </div>
                  </td>
                  <td data-label={t("Actions", "Ibikorwa")}>
                    <div className="penalty-row-actions">
                      {editable && penalty.remaining > 0 && (
                        <button className="register-record-action" onClick={() => setPayment(penalty)}>
                          {t("Record payment", "Andika ubwishyu")}
                        </button>
                      )}
                      {editable && penalty.paid === 0 && (
                        <button
                          className="text-action danger-text"
                          onClick={() => {
                            setCancelling(penalty);
                            setError("");
                          }}
                          aria-label={`${t("Cancel penalty", "Kuraho amande")}: ${penalty.reference}`}
                        >
                          <X size={14} />
                          {t("Cancel", "Kuraho")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          text={t("No assigned penalties in this view", "Nta mande yashyizweho muri iki gihe")}
          detail={t("Add a penalty when a member owes a fine.", "Shyiraho amande umunyamuryango asabwa kwishyura.")}
        />
      )}
      <Pager
        page={data.page}
        pending={url.pending}
        onPage={(penaltyPage) => url.set({ penaltyPage }, { resetPage: false })}
        noun={t("penalties", "amande")}
      />
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>{t("Add unpaid penalty", "Shyiraho amande atarishyurwa")}</DialogTitle>
            <DialogDescription>
              {t(
                "Assign a fine to a member, without recording a payment.",
                "Shyiraho amande asabwa, nta bwishyu wanditse.",
              )}
            </DialogDescription>
          </DialogHeader>
          {adding && <AssessmentForm onSaved={refresh} onClose={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!payment}
        onOpenChange={(open) => {
          if (!open) setPayment(null);
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>{t("Record penalty payment", "Andika ubwishyu bw’amande")}</DialogTitle>
            <DialogDescription>
              {t("Record all or part of the amount still owed.", "Andika yose cyangwa igice cy’amande asigaye.")}
            </DialogDescription>
          </DialogHeader>
          {payment && (
            <ContributionRecordingForm
              key={payment.id}
              kind="penalty"
              initialMemberId={payment.memberCode}
              penalty={payment}
              onSaved={refresh}
              onClose={() => setPayment(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!cancelling}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>{t("Cancel unpaid penalty", "Kuraho amande atarishyurwa")}</DialogTitle>
            <DialogDescription>
              {cancelling?.reference} · {cancelling?.memberName}
            </DialogDescription>
          </DialogHeader>
          <form
            className="portal-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!cancelling) return;
              const reason = String(new FormData(event.currentTarget).get("reason"));
              start(async () => {
                try {
                  const result = await cancelPenaltyAssessment(cancelling.id, reason);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setCancelling(null);
                  refresh();
                } catch {
                  setError(
                    t("The penalty could not be cancelled. Please try again.", "Amande ntiyakuweho. Ongera ugerageze."),
                  );
                }
              });
            }}
          >
            <label className="field">
              {t("Why is this penalty being cancelled?", "Kuki aya mande akurwaho?")}
              <input name="reason" minLength={3} maxLength={300} required />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Action type="submit" className="danger" busy={pending}>
              {t("Cancel penalty", "Kuraho amande")}
            </Action>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function MemberPenalties({ penalties }: { penalties: PenaltyAssessment[] }) {
  const t = useT(),
    dateLabel = useDateLabel();
  if (!penalties.length) return null;
  return (
    <section className="panel member-penalties">
      <SectionHeading
        title={t("Penalties to pay", "Amande yo kwishyura")}
        subtitle={t("These amounts are still owed to your group.", "Aya mande arasabwa kwishyurwa ikimina.")}
      />
      <strong className="penalty-member-total">
        <Money amount={penalties.reduce((sum, p) => sum + p.remaining, 0)} />
      </strong>
      {penalties.map((p) => (
        <div className="penalty-member-row" key={p.id}>
          <div>
            <strong>{p.reason}</strong>
            <small>
              {dateLabel(p.period, true)} · {p.reference}
            </small>
            {p.paid > 0 && (
              <small>
                {money(p.paid)} RWF {t("already paid", "yamaze kwishyurwa")}
              </small>
            )}
          </div>
          <b>{money(p.remaining)} RWF</b>
        </div>
      ))}
    </section>
  );
}
