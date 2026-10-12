"use client";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { Check, ChevronDown, FileText, Upload } from "lucide-react";
import { cancelReceipt, reviewReceipt, uploadContributionReceipt } from "@/app/actions/contribution-proofs";
import type { ContributionProofData } from "@/lib/contribution-proofs";
import { canApproveContributions } from "@/lib/permissions";
import { currentPeriod, kigaliToday, money, SHARE_VALUE } from "@/lib/portal-data";
import { savingsContributionPeriod } from "@/lib/penalty-policy";
import { usePortal } from "./account-dashboard";
import { Action, EmptyState, useDateLabel, useT } from "./portal-ui";
import { ShareAmountField } from "./share-amount-field";
import { DateField, MonthField } from "./ui/date-field";
import { Choice } from "./ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const MAX_BYTES = 5 * 1024 * 1024;
type Proof = ContributionProofData[number];
export function ReceiptContributionForm({
  socialMonthly,
  onChanged,
  onComplete,
  onReviewChange,
}: {
  socialMonthly: number;
  onChanged: () => void;
  onComplete: () => void;
  onReviewChange: (reviewing: boolean) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<"savings" | "social">("savings");
  const [shares, setShares] = useState("1");
  const [amount, setAmount] = useState(String(socialMonthly));
  const [method, setMethod] = useState("Bank transfer"),
    [period, setPeriod] = useState(savingsContributionPeriod()),
    [paidOn, setPaidOn] = useState(kigaliToday()),
    [reference, setReference] = useState(""),
    [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [id, setId] = useState<string | null>(null),
    [step, setStep] = useState(0),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const total = kind === "savings" ? Number(shares) * SHARE_VALUE : Number(amount);
  if (sent)
    return (
      <div className="finance-complete">
        <span>
          <Check size={25} />
        </span>
        <h3>{t("Receipt submitted", "Inyemezabwishyu yoherejwe")}</h3>
        <p>
          {t(
            "The secretary will verify your payment. Your contribution updates after approval.",
            "Umunyamabanga arasuzuma ubwishyu. Umusanzu uzandikwa amaze kwemeza.",
          )}
        </p>
        <Action onClick={onComplete}>{t("View my receipts", "Reba inyemezabwishyu zanjye")}</Action>
      </div>
    );
  return (
    <>
      <p className="receipt-step-label">
        {step === 0
          ? t("1 of 2 · Payment details & receipt", "1 kuri 2 · Amakuru n’inyemezabwishyu")
          : t("2 of 2 · Review your submission", "2 kuri 2 · Suzuma ubusabe")}
      </p>
      <form
        className="portal-form finance-task-form"
        onChange={() => setId(null)}
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (!file) {
            setError(t("Attach your payment receipt.", "Ongeraho inyemezabwishyu."));
            return;
          }
          if (step === 0) {
            setStep(1);
            onReviewChange(true);
            return;
          }
          const submissionId = id ?? crypto.randomUUID();
          setId(submissionId);
          const data = new FormData();
          for (const [key, value] of Object.entries({
            id: submissionId,
            kind,
            amount: String(total),
            method,
            period,
            paidOn,
            paymentReference: reference,
            note,
          }))
            data.set(key, value);
          data.set("receipt", file);
          start(async () => {
            try {
              const result = await uploadContributionReceipt(data);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSent(true);
              onChanged();
            } catch {
              setError(
                t(
                  "Connection lost. Check your receipts before retrying with the same details.",
                  "Umuyoboro wabuze. Banza urebe inyemezabwishyu mbere yo kongera.",
                ),
              );
            }
          });
        }}
      >
        {step === 0 ? (
          <>
            <label className="field">
              {t("Contribution for", "Umusanzu wa")}
              <Choice
                ariaLabel="Receipt contribution type"
                value={kind}
                onChange={(v) => {
                  setKind(v as typeof kind);
                  setPeriod(v === "savings" ? savingsContributionPeriod() : currentPeriod());
                  setId(null);
                }}
                options={[
                  { value: "savings", label: t("Savings shares", "Imigabane y’ubwizigame") },
                  { value: "social", label: t("Social contribution", "Umusanzu w’ingoboka") },
                ]}
              />
            </label>
            {kind === "savings" ? (
              <ShareAmountField
                value={shares}
                onChange={(v) => {
                  setShares(v);
                  setId(null);
                }}
                ariaLabel={t("Receipt savings shares", "Imigabane ku nyemezabwishyu")}
              />
            ) : (
              <label className="field">
                {t("Contribution amount (RWF)", "Umusanzu (RWF)")}
                <input
                  aria-label={t("Receipt contribution amount", "Umusanzu ku nyemezabwishyu")}
                  type="number"
                  min="100"
                  max="100000000"
                  step="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
            <div className="form-grid">
              <div className="field">
                {t("Contribution month", "Ukwezi kw’umusanzu")}
                <MonthField
                  value={period}
                  onChange={(v) => {
                    setPeriod(v);
                    setId(null);
                  }}
                  ariaLabel={t("Contribution month", "Ukwezi kw’umusanzu")}
                />
              </div>
              <div className="field">
                {t("Payment date", "Itariki y’ubwishyu")}
                <DateField
                  value={paidOn}
                  onChange={(v) => {
                    setPaidOn(v);
                    setId(null);
                  }}
                  max={kigaliToday()}
                  required
                  ariaLabel={t("Payment date", "Itariki y’ubwishyu")}
                />
              </div>
            </div>
            <label className="field">
              {t("How did you pay?", "Wishyuye ute?")}
              <Choice
                ariaLabel="Receipt payment method"
                value={method}
                onChange={(v) => {
                  setMethod(v);
                  setId(null);
                }}
                options={[
                  { value: "Bank transfer", label: t("Bank transfer", "Kohereza kuri banki") },
                  { value: "Mobile Money", label: t("Mobile money paid outside Elayo", "Telefoni hanze ya Elayo") },
                  { value: "Cash", label: t("Cash", "Amafaranga mu ntoki") },
                ]}
              />
            </label>
            <label className="field">
              {method === "Cash"
                ? t("Receipt number (optional)", "Inomero y’inyemezabwishyu (si ngombwa)")
                : t("Transaction reference", "Inomero y’ubwishyu")}
              <input
                required={method !== "Cash"}
                minLength={method === "Cash" ? undefined : 3}
                maxLength={100}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t("As shown on your receipt", "Nk’uko iri ku nyemezabwishyu")}
              />
            </label>
            <label className="receipt-upload field">
              <span>
                <Upload size={18} />
                {t("Upload payment receipt", "Ongeraho inyemezabwishyu")}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                required={!file}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) return;
                  if (selected.size > MAX_BYTES || !selected.size) {
                    setError("Choose a receipt up to 5 MB.");
                    e.target.value = "";
                    setFile(null);
                    setPreview("");
                    return;
                  }
                  setError("");
                  setFile(selected);
                  setPreview(selected.type.startsWith("image/") ? URL.createObjectURL(selected) : "");
                }}
              />
              <small>JPG, PNG or PDF · up to 5 MB</small>
              {file && (
                <span className="receipt-file-name">
                  <FileText size={15} />
                  {file.name}
                </span>
              )}
            </label>
            <details className="finance-details">
              <summary>
                {t("Add a note", "Ongeraho ibisobanuro")}
                <ChevronDown size={14} />
              </summary>
              <label className="field">
                {t("Note (optional)", "Ibisobanuro (si ngombwa)")}
                <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </details>
          </>
        ) : (
          <>
            <div className="finance-total">
              <span>
                {kind === "savings"
                  ? t("Savings contribution", "Umusanzu w’ubwizigame")
                  : t("Social contribution", "Umusanzu w’ingoboka")}
              </span>
              <strong>{money(total)} RWF</strong>
            </div>
            <dl className="receipt-summary">
              <div>
                <dt>{t("Contribution month", "Ukwezi kw’umusanzu")}</dt>
                <dd>{period}</dd>
              </div>
              <div>
                <dt>{t("Payment date", "Itariki y’ubwishyu")}</dt>
                <dd>{paidOn}</dd>
              </div>
              <div>
                <dt>{t("Method", "Uburyo")}</dt>
                <dd>{method}</dd>
              </div>
              {reference && (
                <div>
                  <dt>{t("Reference", "Inomero")}</dt>
                  <dd>{reference}</dd>
                </div>
              )}
            </dl>
            {preview ? (
              <Image
                className="receipt-preview"
                src={preview}
                alt="Your payment receipt"
                width={800}
                height={500}
                unoptimized
              />
            ) : (
              <p className="receipt-file-name">
                <FileText size={18} />
                {file?.name}
              </p>
            )}
            <p className="finance-task-hint">
              {t(
                "This submits proof of an existing payment. The secretary must approve it before your balance changes.",
                "Ibi byohereza icyemezo cy’ubwishyu bwakozwe. Umunyamabanga agomba kwemeza mbere yo guhindura ubwizigame.",
              )}
            </p>
            <label className="penalty-check">
              <input type="checkbox" required />
              {t(
                "These details match my receipt and I have already made this payment.",
                "Aya makuru ahuye n’inyemezabwishyu kandi narishyuye.",
              )}
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="finance-task-footer">
          {step > 0 && (
            <Action
              secondary
              disabled={pending}
              onClick={() => {
                setStep(0);
                onReviewChange(false);
              }}
            >
              {t("Back", "Subira")}
            </Action>
          )}
          <Action type="submit" busy={pending} disabled={!file}>
            {step === 0
              ? t("Review receipt", "Suzuma inyemezabwishyu")
              : t("Submit for approval", "Ohereza ngo byemezwe")}
          </Action>
        </div>
      </form>
    </>
  );
}

export function ContributionProofList({
  proofs,
  onChanged,
  admin = false,
}: {
  proofs: ContributionProofData;
  onChanged: () => void;
  admin?: boolean;
}) {
  const t = useT(),
    dateLabel = useDateLabel();
  const { viewer } = usePortal();
  const editable = admin && canApproveContributions(viewer.role);
  const [selected, setSelected] = useState<Proof | null>(null),
    [decision, setDecision] = useState("approve"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (work: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) =>
    start(async () => {
      setError("");
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.error ?? "Could not save this decision.");
          return;
        }
        done?.();
        onChanged();
      } catch {
        setError("Connection lost. Refresh to check this receipt’s status.");
      }
    });
  return (
    <>
      {!proofs.length && (
        <EmptyState
          text={t("No receipt submissions yet", "Nta nyemezabwishyu zoherejwe")}
          detail={
            admin
              ? t("Member receipts awaiting review will appear here.", "Inyemezabwishyu zo gusuzuma zizagaragara hano.")
              : t(
                  "Choose Contribute → Upload a receipt if you paid by cash, bank or outside Elayo.",
                  "Hitamo Tanga umusanzu → Ongeraho inyemezabwishyu niba wishyuye hanze ya Elayo.",
                )
          }
        />
      )}
      {proofs.map((proof) => (
        <article key={proof.id} className="finance-record">
          <div>
            <strong>
              {money(proof.amount)} RWF ·{" "}
              {proof.kind === "savings" ? t("Savings", "Ubwizigame") : t("Social contribution", "Umusanzu w’ingoboka")}
            </strong>
            <small>
              {admin && `${proof.memberCode} · ${proof.memberName} · `}
              {dateLabel(proof.period, true)} · {proof.method}
            </small>
            <p className="finance-next-step">
              {proof.status === "pending"
                ? t("Awaiting secretary review", "Bitegereje umunyamabanga")
                : proof.status === "approved"
                  ? t("Approved and added to your contributions", "Byemejwe byandikwa mu misanzu")
                  : proof.status === "rejected"
                    ? t("Declined — check the review note", "Byanzwe — reba ibisobanuro")
                    : t("Submission cancelled", "Ubusabe bwahagaritswe")}
            </p>
            {proof.reviewNote && <p>{proof.reviewNote}</p>}
          </div>
          <div className="finance-record-actions">
            <span className={`status-pill ${proof.status === "pending" ? "amber" : ""}`}>
              {proof.status === "pending"
                ? t("Pending", "Birategerejwe")
                : proof.status === "approved"
                  ? t("Approved", "Byemejwe")
                  : proof.status === "rejected"
                    ? t("Declined", "Byanzwe")
                    : t("Cancelled", "Byahagaritswe")}
            </span>
            <Action
              secondary
              onClick={() => {
                setSelected(proof);
                setNote("");
                setDecision("approve");
                setError("");
              }}
            >
              {editable && proof.status === "pending"
                ? t("Review receipt", "Suzuma inyemezabwishyu")
                : t("View receipt", "Reba inyemezabwishyu")}
            </Action>
            {!admin && proof.status === "pending" && (
              <button className="text-action" disabled={pending} onClick={() => run(() => cancelReceipt(proof.id))}>
                {t("Cancel submission", "Hagarika ubusabe")}
              </button>
            )}
          </div>
        </article>
      ))}
      {error && !selected && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !pending) setSelected(null);
        }}
      >
        <DialogContent className="portal-dialog money-task-dialog">
          <DialogHeader>
            <DialogTitle>
              {editable && selected?.status === "pending"
                ? t("Review contribution receipt", "Suzuma inyemezabwishyu y’umusanzu")
                : t("Contribution receipt", "Inyemezabwishyu y’umusanzu")}
            </DialogTitle>
            <DialogDescription>{selected ? `${selected.memberCode} · ${selected.memberName}` : ""}</DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="finance-total">
                <span>
                  {selected.kind === "savings"
                    ? t("Savings", "Ubwizigame")
                    : t("Social contribution", "Umusanzu w’ingoboka")}
                </span>
                <strong>{money(selected.amount)} RWF</strong>
              </div>
              <dl className="receipt-summary">
                <div>
                  <dt>{t("Contribution month", "Ukwezi kw’umusanzu")}</dt>
                  <dd>{dateLabel(selected.period, true)}</dd>
                </div>
                <div>
                  <dt>{t("Payment date", "Itariki y’ubwishyu")}</dt>
                  <dd>{dateLabel(kigaliToday(new Date(selected.paidAt)))}</dd>
                </div>
                <div>
                  <dt>{t("Method", "Uburyo")}</dt>
                  <dd>{selected.method}</dd>
                </div>
                {selected.paymentReference && (
                  <div>
                    <dt>{t("Reference", "Inomero")}</dt>
                    <dd>{selected.paymentReference}</dd>
                  </div>
                )}
              </dl>
              {selected.note && <p className="finance-task-hint">{selected.note}</p>}
              {selected.mimeType.startsWith("image/") && (
                <Image
                  className="receipt-preview"
                  src={`/api/contributions/receipts/${selected.id}`}
                  alt="Submitted payment receipt"
                  width={800}
                  height={500}
                  unoptimized
                />
              )}
              <a
                className="action secondary receipt-open"
                href={`/api/contributions/receipts/${selected.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText size={16} />
                {selected.mimeType === "application/pdf"
                  ? t("Download PDF receipt", "Kuramo PDF")
                  : t("Open full receipt", "Fungura inyemezabwishyu")}
              </a>
              {selected.reviewNote && <p className="finance-task-hint">{selected.reviewNote}</p>}
              {editable && selected.status === "pending" && (
                <form
                  className="portal-form finance-task-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () => reviewReceipt({ id: selected.id, approve: decision === "approve", note }),
                      () => setSelected(null),
                    );
                  }}
                >
                  <label className="field">
                    {t("Decision", "Icyemezo")}
                    <Choice
                      ariaLabel="Receipt review decision"
                      value={decision}
                      onChange={setDecision}
                      options={[
                        { value: "approve", label: t("Approve contribution", "Emeza umusanzu") },
                        { value: "reject", label: t("Decline receipt", "Anga inyemezabwishyu") },
                      ]}
                    />
                  </label>
                  <label className="field">
                    {t("Review note", "Ibisobanuro by’isuzuma")}
                    <textarea
                      required
                      minLength={3}
                      maxLength={500}
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  {decision === "approve" && (
                    <label className="penalty-check">
                      <input type="checkbox" required />
                      {t(
                        "I verified the payment was received and is not already recorded.",
                        "Nemeje ko ubwishyu bwakiriwe kandi butanditswe ahandi.",
                      )}
                    </label>
                  )}
                  {error && (
                    <p role="alert" className="form-error">
                      {error}
                    </p>
                  )}
                  <Action type="submit" busy={pending}>
                    {decision === "approve"
                      ? t("Approve & record contribution", "Emeza wandike umusanzu")
                      : t("Decline receipt", "Anga inyemezabwishyu")}
                  </Action>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
