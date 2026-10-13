"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Coins,
  FileText,
  HandCoins,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import {
  acceptLoanTerms,
  deductLoanProcessingFee,
  cancelFundsRequest,
  checkMobilePayment,
  contributeMobileMoney,
  getOwnFinance,
  payApprovedRequest,
  requestFunds,
  reviewFunds,
  replyToLoanBacking,
  searchLoanBackers,
} from "@/app/actions/mobile-money";
import type { FinanceData } from "@/lib/mobile-money";
import { currentPeriod, money, type Member } from "@/lib/portal-data";
import { DEFAULT_FEE_BPS, quoteCollection, quotePayout } from "@/lib/payment-fees";
import { DEFAULT_LOAN_POLICY, type LoanPolicy } from "@/lib/loan-policy";
import { canApproveLoans, canEditRecords } from "@/lib/permissions";
import { usePortal } from "./account-dashboard";
import { LoanTermsSummary } from "./loan-terms";
import { ContributionProofList, ReceiptContributionForm } from "./contribution-proof-panel";
import { PushNotificationButton } from "./push-notifications";
import { savingsContributionPeriod } from "@/lib/penalty-policy";
import { Action, EmptyState, SectionHeading, useDateLabel, useT } from "./portal-ui";
import { SavingsAmountField } from "./share-amount-field";
import { MonthField } from "./ui/date-field";
import { Choice } from "./ui/choice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

type Config = { mode: "test" | "live"; configured: boolean; feeBps: number };
type Outcome = { ok: boolean; error?: string };
type Request = FinanceData["requests"][number];
type Payment = FinanceData["payments"][number];
function useFinanceAction(onChanged: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const execute = (work: () => Promise<Outcome>, message: string, after?: () => void) =>
    start(async () => {
      setError("");
      setSuccess("");
      try {
        const result = await work();
        if (!result.ok) setError(result.error ?? "Could not complete this operation.");
        else {
          setSuccess(message);
          after?.();
        }
      } catch {
        setError("Connection lost. Refresh to check the saved status before trying again.");
      } finally {
        onChanged();
      }
    });
  return {
    pending,
    execute,
    feedback: (
      <>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="form-success">
            <Check size={15} />
            {success}
          </p>
        )}
      </>
    ),
  };
}

export function MemberMobileMoney({
  member,
  socialMonthly,
  onChanged,
}: {
  member: Member;
  socialMonthly: number;
  onChanged: () => void;
}) {
  const t = useT();
  const [data, setData] = useState<FinanceData | null>(null);
  const [config, setConfig] = useState<Config>({ mode: "test", configured: false, feeBps: DEFAULT_FEE_BPS });
  const [error, setError] = useState("");
  const previousPayments = useRef<Payment[]>([]);
  const [policy, setPolicy] = useState<LoanPolicy>(DEFAULT_LOAN_POLICY);
  const [position, setPosition] = useState({ total: 0, locked: 0, withdrawals: 0, available: 0 });
  const [loanLimit, setLoanLimit] = useState(0);
  const [task, setTask] = useState<"contribute" | "request" | "repay" | null>(null);
  const [activity, setActivity] = useState<"requests" | "payments" | "backing" | "receipts">("requests");
  const reload = useCallback(async () => {
    try {
      const result = await getOwnFinance();
      if (result.ok) {
        const completed = result.value.payments.some(
          (p) =>
            p.status === "succeeded" &&
            previousPayments.current.some((old) => old.id === p.id && old.status !== "succeeded"),
        );
        previousPayments.current = result.value.payments;
        setData(result.value);
        setConfig(result.value.config);
        setError("");
        setPolicy(result.value.policy);
        setPosition(result.value.position);
        setLoanLimit(result.value.savingsLoanLimit);
        if (completed) onChanged();
      } else setError(result.error);
    } catch {
      setError("Could not refresh payment activity. Please try again.");
    }
  }, [onChanged]);
  useEffect(() => {
    let active = true;
    getOwnFinance()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          previousPayments.current = result.value.payments;
          setData(result.value);
          setConfig(result.value.config);
          setPolicy(result.value.policy);
          setPosition(result.value.position);
          setLoanLimit(result.value.savingsLoanLimit);
          setError("");
        } else setError(result.error);
      })
      .catch(() => {
        if (active) setError("Could not load payment activity. Please refresh.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!data?.payments.some((p) => ["created", "pending"].includes(p.status))) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [data, reload]);
  const refresh = () => {
    void reload();
    onChanged();
  };
  const repayable =
    data?.requests.filter((r) => r.kind === "loan" && r.status === "paid" && (r.outstanding ?? 0) > 0) ?? [];
  const invitations = data?.invitations.filter((b) => b.status === "pending" && b.loanStatus === "requested") ?? [];
  return (
    <div className="member-money-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("YOUR MONEY", "AMAFARANGA YAWE")}</span>
          <h1>
            {t("Payments & loans", "Ubwishyu n’inguzanyo")}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t("What would you like to do today?", "Urashaka gukora iki uyu munsi?")}</p>
        </div>
        <Action secondary onClick={refresh}>
          <RefreshCw size={16} />
          {t("Refresh", "Vugurura")}
        </Action>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <section className="money-balance-card" aria-label="Savings available">
        <div className="money-balance-main">
          <span>
            <Wallet size={18} />
            {t("Available savings", "Ubwizigame bwaboneka")}
          </span>
          <strong>
            {data ? money(position.available) : "—"}
            <small>RWF</small>
          </strong>
          <p>{t("Ready to save, support or withdraw.", "Biteguye kwizigama, gufasha cyangwa kubikuza.")}</p>
        </div>
        <div className="money-balance-side">
          <div>
            <span>{t("Reserved for loans", "Ayafashwe ku nguzanyo")}</span>
            <strong>{data ? money(position.locked) : "—"} RWF</strong>
          </div>
          <div>
            <span>{t("Savings loan limit", "Inguzanyo ku bwizigame")}</span>
            <strong>{data ? money(loanLimit) : "—"} RWF</strong>
          </div>
        </div>
      </section>
      <div className="money-task-cards">
        <button className="money-task-card" onClick={() => setTask("contribute")}>
          <span className="money-task-icon">
            <Coins size={24} />
          </span>
          <strong>{t("Contribute", "Tanga umusanzu")}</strong>
          <span>
            {t("Add savings or pay your social contribution.", "Ongera ubwizigame cyangwa wishyure ingoboka.")}
          </span>
          <span className="money-task-link">
            {t("Make a payment", "Ishyura")}
            <ArrowRight size={16} />
          </span>
        </button>
        <button className="money-task-card" onClick={() => setTask("request")}>
          <span className="money-task-icon violet">
            <HandCoins size={24} />
          </span>
          <strong>{t("Request funds", "Saba amafaranga")}</strong>
          <span>{t("Apply for a loan or withdraw savings.", "Saba inguzanyo cyangwa ubikuze ubwizigame.")}</span>
          <span className="money-task-link">
            {t("Start a request", "Tangira ubusabe")}
            <ArrowRight size={16} />
          </span>
        </button>
        <button className="money-task-card" disabled={!data || !repayable.length} onClick={() => setTask("repay")}>
          <span className="money-task-icon mint">
            <ArrowDownLeft size={24} />
          </span>
          <strong>{t("Repay a loan", "Ishyura inguzanyo")}</strong>
          <span>
            {repayable.length
              ? t(
                  `${repayable.length} active loan${repayable.length > 1 ? "s" : ""} to repay.`,
                  `Inguzanyo ${repayable.length} zo kwishyura.`,
                )
              : t("No loan repayments due.", "Nta nguzanyo yo kwishyura.")}
          </span>
          <span className="money-task-link">
            {t("Make a repayment", "Ishyura inguzanyo")}
            <ArrowRight size={16} />
          </span>
        </button>
      </div>
      {!config.configured && (
        <p className="money-connection-note">
          <Smartphone size={16} />
          {t(
            "Mobile money setup is pending. You can upload a receipt or request funds.",
            "Ubwishyu kuri telefoni buracyategurwa. Ongeraho inyemezabwishyu cyangwa usabe amafaranga.",
          )}
        </p>
      )}
      {config.configured && config.mode === "test" && <ConnectionNotice config={config} />}
      <section className="panel money-activity">
        <div className="money-activity-heading">
          <h2>{t("Your activity", "Ibikorwa byawe")}</h2>
          {invitations.length > 0 && (
            <button className="text-action" onClick={() => setActivity("backing")}>
              {invitations.length} · {t("Review backing requests", "Suzuma ubusabe bwo gufasha")}
              <ArrowRight size={15} />
            </button>
          )}
        </div>
        <div className="money-activity-tabs" role="tablist" aria-label={t("Money activity", "Ibikorwa by’amafaranga")}>
          {(["requests", "payments", "receipts", "backing"] as const).map((v) => (
            <button
              key={v}
              id={`money-tab-${v}`}
              role="tab"
              tabIndex={activity === v ? 0 : -1}
              onKeyDown={(e) => {
                const choices = ["requests", "payments", "receipts", "backing"] as const;
                const index = choices.indexOf(v);
                const next =
                  e.key === "ArrowRight"
                    ? choices[(index + 1) % choices.length]
                    : e.key === "ArrowLeft"
                      ? choices[(index + choices.length - 1) % choices.length]
                      : e.key === "Home"
                        ? choices[0]
                        : e.key === "End"
                          ? choices.at(-1)!
                          : null;
                if (next) {
                  e.preventDefault();
                  setActivity(next);
                  document.getElementById(`money-tab-${next}`)?.focus();
                }
              }}
              aria-selected={activity === v}
              aria-controls={`money-panel-${v}`}
              onClick={() => setActivity(v)}
            >
              {v === "requests" ? (
                <HandCoins size={15} aria-hidden="true" />
              ) : v === "payments" ? (
                <Smartphone size={15} aria-hidden="true" />
              ) : v === "receipts" ? (
                <FileText size={15} aria-hidden="true" />
              ) : (
                <ShieldCheck size={15} aria-hidden="true" />
              )}
              {v === "requests"
                ? t("My requests", "Ibisabwa byanjye")
                : v === "payments"
                  ? t("Payments", "Ubwishyu")
                  : v === "receipts"
                    ? t("Receipts", "Inyemezabwishyu")
                    : t("Backing", "Gufasha")}
              {v === "backing" && invitations.length > 0 && <b>{invitations.length}</b>}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`money-panel-${activity}`} aria-labelledby={`money-tab-${activity}`}>
          {!data ? (
            <p role="status" className="money-loading">
              {t("Loading your activity…", "Tegereza ibikorwa byawe…")}
            </p>
          ) : activity === "requests" ? (
            <RequestList data={data} config={config} onChanged={refresh} />
          ) : activity === "payments" ? (
            <PaymentList payments={data.payments} onChanged={refresh} />
          ) : activity === "receipts" ? (
            <ContributionProofList proofs={data.proofs} onChanged={refresh} />
          ) : (
            <BackingInvitations data={data} onChanged={refresh} />
          )}
        </div>
      </section>
      <div className="money-notifications">
        <PushNotificationButton />
      </div>
      <Dialog
        open={!!task}
        onOpenChange={(open) => {
          if (!open) setTask(null);
        }}
      >
        <DialogContent className="portal-dialog money-task-dialog">
          <DialogHeader>
            <DialogTitle>
              {task === "request"
                ? t("Request funds", "Saba amafaranga")
                : task === "repay"
                  ? t("Repay a loan", "Ishyura inguzanyo")
                  : t("Make a contribution", "Tanga umusanzu")}
            </DialogTitle>
            <DialogDescription>
              {task === "request"
                ? t("A few steps to prepare your request for review.", "Intambwe nke zo gutegura ubusabe bwawe.")
                : task === "contribute"
                  ? t(
                      "Pay by phone, or upload proof of a payment you already made.",
                      "Ishyura kuri telefoni cyangwa wongereho icyemezo cy’ubwishyu wakoze.",
                    )
                  : t(
                      "Choose your amount, then review before paying.",
                      "Hitamo amafaranga, uyasuzume mbere yo kwishyura.",
                    )}
            </DialogDescription>
          </DialogHeader>
          {task === "request" ? (
            <FundsForm
              key={policy.version}
              member={member}
              config={config}
              policy={policy}
              position={position}
              loaded={!!data}
              onChanged={refresh}
              onComplete={() => {
                setTask(null);
                setActivity("requests");
              }}
            />
          ) : (
            task && (
              <ContributionForm
                member={member}
                socialMonthly={socialMonthly}
                config={config}
                loans={data?.requests ?? []}
                repayment={task === "repay"}
                onChanged={refresh}
                onReceiptComplete={() => {
                  setTask(null);
                  setActivity("receipts");
                }}
                onComplete={() => {
                  setTask(null);
                  setActivity("payments");
                }}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function FinanceSteps({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol className="finance-steps" aria-label="Progress">
      {labels.map((label, i) => (
        <li
          key={label}
          className={i === step ? "current" : i < step ? "complete" : ""}
          aria-current={i === step ? "step" : undefined}
        >
          <span>{i < step ? <Check size={12} /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function ConnectionNotice({ config }: { config: Config }) {
  const t = useT();
  return (
    <div className={`finance-notice ${config.mode === "test" || !config.configured ? "amber" : ""}`} role="status">
      <Smartphone size={20} />
      <p>
        {!config.configured
          ? t(
              "Mobile money is awaiting setup. You can still submit loan and withdrawal requests for review.",
              "Ubwishyu kuri telefoni ntiburahuzwa. Ushobora gusaba inguzanyo cyangwa kubikuza.",
            )
          : config.mode === "test"
            ? t(
                "Test mode: payments take real money from registered test phones. They do not add to your savings. Cashouts are unavailable until live mode is connected.",
                "Uburyo bwo kugerageza: ubwishyu bukura amafaranga nyayo kuri telefoni zanditswe. Ntabwo bwongera ubwizigame. Kubikuza ntibirakora.",
              )
            : t(
                "Pay with MTN MoMo or Airtel Money. Members cover provider fees. Review the fee and total before confirming your payment.",
                "Ishyura na MTN MoMo cyangwa Airtel Money. Abanyamuryango bishyura ikiguzi. Reba ikiguzi n’igiteranyo mbere yo kwemeza ubwishyu.",
              )}
      </p>
    </div>
  );
}
function FeeSummary({
  amount,
  feeBps,
  direction,
  loan = false,
}: {
  amount: number;
  feeBps: number;
  direction: "collect" | "payout";
  loan?: boolean;
}) {
  const t = useT();
  const value = Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
  const quote = direction === "collect" ? quoteCollection(value, feeBps) : quotePayout(value, feeBps);
  return (
    <div className="finance-fee-summary">
      <div>
        <span>{direction === "collect" ? t("Amount", "Amafaranga") : t("You receive", "Uzakira")}</span>
        <strong>{money(value)} RWF</strong>
      </div>
      <div className="finance-fee-line">
        <span>{t("Mobile money fee", "Ikiguzi cya telefoni")}</span>
        <strong>{money(quote.fee)} RWF</strong>
      </div>
      {direction === "collect" && quote.walletAmount - quote.fee > value && (
        <div>
          <span>Surplus returned to savings</span>
          <strong>{money(quote.walletAmount - quote.fee - value)} RWF</strong>
        </div>
      )}
      <div className="finance-total">
        <span>
          {direction === "collect"
            ? t("You pay", "Uzishyura")
            : loan
              ? t("Loan principal including fee", "Inguzanyo n’ikiguzi")
              : t("Savings deducted including fee", "Ubwizigame bukurwaho n’ikiguzi")}
        </span>
        <strong>
          {money(direction === "collect" ? quote.walletAmount : "accountAmount" in quote ? quote.accountAmount : 0)} RWF
        </strong>
      </div>
      <small>
        {t(
          "The final provider fee is confirmed after payment.",
          "Ikiguzi kigereranywa ku gipimo kiriho; ikiguzi cyemejwe cyandikwa ubwishyu burangiye.",
        )}
      </small>
    </div>
  );
}
function ContributionForm({
  member,
  socialMonthly,
  config,
  loans,
  onChanged,
  repayment = false,
  onComplete,
  onReceiptComplete,
}: {
  member: Member;
  socialMonthly: number;
  config: Config;
  loans: Request[];
  onChanged: () => void;
  repayment?: boolean;
  onComplete: () => void;
  onReceiptComplete: () => void;
}) {
  const t = useT();
  const outstanding = loans.filter((r) => r.kind === "loan" && r.status === "paid" && (r.outstanding ?? 0) > 0);
  const [kind, setKind] = useState<"savings" | "social" | "loan_repayment">(repayment ? "loan_repayment" : "savings");
  const [savingsAmount, setSavingsAmount] = useState("");
  const [amount, setAmount] = useState(String(repayment ? (outstanding[0]?.outstanding ?? 0) : socialMonthly));
  const [phone, setPhone] = useState(member.phone);
  const [period, setPeriod] = useState(repayment ? currentPeriod() : savingsContributionPeriod());
  const [note, setNote] = useState("");
  const [loan, setLoan] = useState(outstanding[0]?.id ?? "");
  const [id, setId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);
  const [receiptReview, setReceiptReview] = useState(false);
  const [channel, setChannel] = useState<"mobile" | "receipt">("mobile");
  const methods = !repayment && (
    <div
      className="contribution-methods"
      role="group"
      aria-label={t("Contribution method", "Uburyo bwo gutanga umusanzu")}
    >
      <button type="button" aria-pressed={channel === "mobile"} onClick={() => setChannel("mobile")}>
        <Smartphone size={18} />
        <span>
          {t("Pay with mobile money", "Ishyura kuri telefoni")}
          <small>{t("Receive a payment prompt", "Ubwishyu bwemezwa kuri telefoni")}</small>
        </span>
      </button>
      <button type="button" aria-pressed={channel === "receipt"} onClick={() => setChannel("receipt")}>
        <FileText size={18} />
        <span>
          {t("Upload a receipt", "Ongeraho inyemezabwishyu")}
          <small>{t("I already paid another way", "Narishyuye mu bundi buryo")}</small>
        </span>
      </button>
    </div>
  );
  const action = useFinanceAction(onChanged);
  const total = kind === "savings" ? Number(savingsAmount) : Number(amount);
  if (channel === "receipt" && !repayment)
    return (
      <>
        {!receiptReview && methods}
        <ReceiptContributionForm
          socialMonthly={socialMonthly}
          onChanged={onChanged}
          onComplete={onReceiptComplete}
          onReviewChange={setReceiptReview}
        />
      </>
    );
  if (sent)
    return (
      <div className="finance-complete">
        <span>
          <Check size={25} />
        </span>
        <h3>{t("Check your phone", "Reba telefoni yawe")}</h3>
        <p>
          {t(
            "Approve the mobile money prompt. Track confirmation in Payments.",
            "Emeza ubwishyu kuri telefoni. Kurikirana icyemezo mu Bwishyu.",
          )}
        </p>
        <Action onClick={onComplete}>{t("View payment activity", "Reba amateka y’ubwishyu")}</Action>
      </div>
    );
  return (
    <>
      {step === 0 && methods}
      <FinanceSteps
        labels={[t("Payment details", "Amakuru y’ubwishyu"), t("Review & pay", "Suzuma wishyure")]}
        step={step}
      />
      <form
        className="portal-form finance-task-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 0) {
            setStep(1);
            return;
          }
          const reference = id ?? crypto.randomUUID();
          setId(reference);
          action.execute(
            () =>
              contributeMobileMoney({
                id: reference,
                kind,
                amount: total,
                feeBps: config.feeBps,
                phone,
                period,
                note,
                ...(kind === "loan_repayment" ? { requestId: loan } : {}),
              }),
            "",
            () => setSent(true),
          );
        }}
      >
        {step === 0 ? (
          <>
            {!repayment && (
              <label className="field">
                {t("Payment for", "Icyishyurwa")}
                <Choice
                  ariaLabel={t("Payment for", "Icyishyurwa")}
                  value={kind}
                  onChange={(v) => {
                    setKind(v as typeof kind);
                    setPeriod(v === "savings" ? savingsContributionPeriod() : currentPeriod());
                  }}
                  options={[
                    { value: "savings", label: t("Savings", "Ubwizigame") },
                    { value: "social", label: t("Social contribution", "Umusanzu w’ingoboka") },
                  ]}
                />
              </label>
            )}
            {repayment && (
              <label className="field">
                {t("Loan", "Inguzanyo")}
                <Choice
                  ariaLabel="Loan to repay"
                  value={loan}
                  onChange={(value) => {
                    setLoan(value);
                    const chosen = outstanding.find((r) => r.id === value);
                    if (chosen) setAmount(String(chosen.outstanding));
                  }}
                  options={outstanding.map((r) => ({
                    value: r.id,
                    label: `${r.id.slice(0, 8)} · ${money(r.outstanding ?? 0)} RWF remaining`,
                  }))}
                />
              </label>
            )}
            {kind === "savings" ? (
              <SavingsAmountField period={period} value={savingsAmount} onChange={setSavingsAmount} />
            ) : (
              <label className="field">
                {t("Amount (RWF)", "Amafaranga (RWF)")}
                <input
                  type="number"
                  min={repayment ? 1 : 100}
                  max={repayment ? (outstanding.find((r) => r.id === loan)?.outstanding ?? 100000000) : 100000000}
                  step="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              {t("Mobile money phone", "Telefoni yo kwishyuriraho")}
              <input
                type="tel"
                required
                maxLength={30}
                autoComplete="tel"
                placeholder="078 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            {!repayment && (
              <div className="field">
                {t("Contribution month", "Ukwezi kw’umusanzu")}
                <MonthField
                  value={period}
                  onChange={setPeriod}
                  ariaLabel={t("Contribution month", "Ukwezi kw’umusanzu")}
                />
              </div>
            )}
            <details className="finance-details">
              <summary>
                {t("Add a note", "Ongeraho ibisobanuro")}
                <ChevronDown size={14} />
              </summary>
              <label className="field">
                {t("Note (optional)", "Ibisobanuro (si ngombwa)")}
                <input maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </details>
          </>
        ) : (
          <>
            <div className="finance-review-intro">
              <strong>
                <FinanceLabel value={kind} />
              </strong>
              <span>
                {period} · {phone}
              </span>
            </div>
            <FeeSummary amount={total} feeBps={config.feeBps} direction="collect" />
            <p className="finance-task-hint">
              {t(
                "Approve the prompt on your phone. Never enter your mobile money PIN here.",
                "Emeza ubwishyu kuri telefoni. Ntushyire PIN yawe hano.",
              )}
            </p>
            <ConnectionNotice config={config} />
          </>
        )}
        <div className="finance-task-footer">
          {step > 0 && (
            <Action secondary disabled={action.pending} onClick={() => setStep(0)}>
              {t("Back", "Subira")}
            </Action>
          )}
          <Action
            type="submit"
            busy={action.pending}
            disabled={step === 1 && (!config.configured || (repayment && config.mode !== "live"))}
          >
            {step === 0 ? t("Review payment", "Suzuma ubwishyu") : t("Pay with mobile money", "Ishyura kuri telefoni")}
            <ArrowRight size={16} />
          </Action>
        </div>
        {action.feedback}
      </form>
    </>
  );
}
function FundsForm({
  member,
  config,
  policy,
  position,
  loaded,
  onChanged,
  onComplete,
}: {
  member: Member;
  config: Config;
  policy: LoanPolicy;
  position: { total: number; available: number; locked: number };
  loaded: boolean;
  onChanged: () => void;
  onComplete: () => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<"loan" | "withdrawal">("loan");
  const [loanType, setLoanType] = useState<"savings" | "backed">("savings");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(member.phone);
  const [reason, setReason] = useState("");
  const [months, setMonths] = useState("");
  const [own, setOwn] = useState("0");
  const [backers, setBackers] = useState([{ code: "", amount: "" }]);
  const [id, setId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);
  const action = useFinanceAction(onChanged);
  const rule = policy[loanType],
    numericAmount = Number(amount),
    quote = quotePayout(Number.isSafeInteger(numericAmount) && numericAmount >= 0 ? numericAmount : 0, config.feeBps);
  const backed = kind === "loan" && loanType === "backed",
    reviewStep = backed ? 2 : 1;
  const coverage = Number(own) + backers.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const fee = kind === "loan" ? Math.ceil((Math.max(0, numericAmount) * policy.processingFeeBps) / 10000) : 0;
  const capacityAfterFee = Math.max(
    0,
    Math.min(
      position.available - fee,
      Math.floor(((position.total - fee) * policy.savingsLimitBps) / 10000) - position.locked,
    ),
  );
  const feeUnavailable = fee > position.available;
  const limitExceeded = kind === "loan" && loanType === "savings" && quote.accountAmount > capacityAfterFee;
  const coverageInvalid = backed && (coverage !== quote.accountAmount || backers.length < policy.minBackers);
  const terms = {
    ...rule,
    version: policy.version,
    repaymentOrder: policy.repaymentOrder,
    release: policy.release,
    graceDays: policy.graceDays,
    backingMode: policy.backingMode,
    savingsLimitBps: policy.savingsLimitBps,
    backerLimitBps: policy.backerLimitBps,
    allowSelfApproval: policy.allowSelfApproval,
    processingFeeBps: policy.processingFeeBps,
    processingFeeSource: "savings" as const,
  };
  if (sent)
    return (
      <div className="finance-complete">
        <span>
          <Check size={25} />
        </span>
        <h3>{t("Request saved", "Ubusabe bwabitswe")}</h3>
        <p>
          {kind === "loan" && fee > 0
            ? t(
                "Your processing fee was deducted from savings. Follow backing approvals and manager review in My requests.",
                "Ikiguzi cy’inguzanyo cyakuwe mu bwizigame. Kurikirana isuzuma mu Bisabwa byanjye.",
              )
            : t("Follow the review of your request in My requests.", "Kurikirana isuzuma mu Bisabwa byanjye.")}
        </p>
        <Action onClick={onComplete}>{t("View my request", "Reba ubusabe bwanjye")}</Action>
      </div>
    );
  return (
    <>
      <FinanceSteps
        labels={
          backed
            ? [t("Details", "Amakuru"), t("Backing", "Gufasha"), t("Review", "Suzuma")]
            : [t("Details", "Amakuru"), t("Review", "Suzuma")]
        }
        step={step}
      />
      <form
        className="portal-form finance-task-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < reviewStep) {
            setStep(step + 1);
            return;
          }
          const reference = id ?? crypto.randomUUID();
          setId(reference);
          action.execute(
            () =>
              requestFunds({
                id: reference,
                kind,
                amount: numericAmount,
                feeBps: config.feeBps,
                phone,
                reason,
                ...(kind === "loan"
                  ? {
                      loanType,
                      repaymentMonths: Number(months || rule.maxMonths),
                      policyVersion: policy.version,
                      ownBackingAmount: backed ? Number(own) : 0,
                      backers: backed ? backers.map((b) => ({ code: b.code, amount: Number(b.amount) })) : [],
                    }
                  : {}),
              }),
            "",
            () => setSent(true),
          );
        }}
      >
        {step === 0 && (
          <>
            <label className="field">
              {t("I would like to", "Ndashaka")}
              <Choice
                ariaLabel="Request type"
                value={kind}
                onChange={(v) => setKind(v as typeof kind)}
                options={[
                  { value: "loan", label: t("Request a loan", "Saba inguzanyo") },
                  { value: "withdrawal", label: t("Withdraw savings", "Bikuza ubwizigame") },
                ]}
              />
            </label>
            {kind === "loan" && (
              <>
                <label className="field">
                  {t("Loan type", "Ubwoko bw’inguzanyo")}
                  <Choice
                    ariaLabel="Loan type"
                    value={loanType}
                    onChange={(v) => {
                      setLoanType(v as typeof loanType);
                      setMonths("");
                    }}
                    options={[
                      { value: "savings", label: t("Against my savings", "Ku bwizigame bwanjye") },
                      { value: "backed", label: t("With member backing", "Mfashijwe n’abanyamuryango") },
                    ]}
                  />
                </label>
                <p className="finance-task-hint">
                  {rule.rateBps / 100}%{" "}
                  {rule.periodMonths === 1
                    ? t("monthly interest", "inyungu buri kwezi")
                    : t(`interest every ${rule.periodMonths} months`, `inyungu buri mezi ${rule.periodMonths}`)}
                  {loanType === "savings"
                    ? ` · ${money(capacityAfterFee)} RWF capacity after the processing fee`
                    : " · Supporting members must approve their backing."}
                </p>
              </>
            )}
            <div className="form-grid">
              <label className="field">
                {t("Amount to receive (RWF)", "Amafaranga uzakira (RWF)")}
                <input
                  type="number"
                  min="10000"
                  max="100000000"
                  step="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              {kind === "loan" && (
                <label className="field">
                  {t("Repayment (months)", "Kwishyura (amezi)")}
                  <input
                    type="number"
                    min="1"
                    max={rule.maxMonths}
                    step="1"
                    required
                    value={months || String(rule.maxMonths)}
                    onChange={(e) => setMonths(e.target.value)}
                  />
                </label>
              )}
            </div>
            {feeUnavailable && (
              <p className="form-error">
                {t(
                  `The processing fee needs ${money(fee)} RWF in available savings. Make a contribution first.`,
                  `Ikiguzi gikenera ${money(fee)} RWF mu bwizigame buboneka. Banza utange umusanzu.`,
                )}
              </p>
            )}
            {limitExceeded && (
              <p className="form-error">
                {t(
                  "After deducting the processing fee, this amount plus the payout fee exceeds your savings loan limit. Choose a lower amount or member backing.",
                  "Aya mafaranga n’ikiguzi arenga inguzanyo yemerewe. Gabanya cyangwa usabe gufashwa.",
                )}
              </p>
            )}
            <label className="field">
              {t("Receiving phone", "Telefoni yakira amafaranga")}
              <input type="tel" required maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="field">
              {t("What are the funds for?", "Amafaranga ni ay’iki?")}
              <textarea
                minLength={5}
                maxLength={500}
                required
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </>
        )}
        {backed && step === 1 && (
          <>
            <div className="finance-review-intro">
              <strong>{t("Choose your supporting members", "Hitamo abagufasha")}</strong>
              <span>
                {t("Their approvals are required before manager review.", "Bagomba kwemeza mbere y’isuzuma.")}
              </span>
            </div>
            <div className="finance-total">
              <span>{t("Backing needed, including payout fee", "Ayakenewe harimo ikiguzi")}</span>
              <strong>{money(quote.accountAmount)} RWF</strong>
            </div>
            <label className="field">
              {t("My own backing (optional, RWF)", "Ubufasha bwanjye (si ngombwa, RWF)")}
              <input
                type="number"
                min="0"
                max={capacityAfterFee}
                step="1"
                value={own}
                onChange={(e) => setOwn(e.target.value)}
              />
            </label>
            <div className="loan-backing-plan">
              {backers.map((b, index) => (
                <div className="loan-backing-row" key={index}>
                  <BackerPicker
                    value={b.code}
                    onChange={(code) => setBackers((rows) => rows.map((r, i) => (i === index ? { ...r, code } : r)))}
                  />
                  <label className="field">
                    Backing amount (RWF)
                    <input
                      type="number"
                      min="1"
                      max="100000000"
                      step="1"
                      required
                      value={b.amount}
                      onChange={(e) =>
                        setBackers((rows) => rows.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))
                      }
                    />
                  </label>
                  {backers.length > 1 && (
                    <Action secondary onClick={() => setBackers((rows) => rows.filter((_, i) => i !== index))}>
                      Remove
                    </Action>
                  )}
                </div>
              ))}
            </div>
            <Action
              secondary
              disabled={backers.length >= policy.maxBackers}
              onClick={() => setBackers((rows) => [...rows, { code: "", amount: "" }])}
            >
              Add supporting member
            </Action>
            <p className={coverageInvalid ? "finance-task-hint" : "form-success"}>
              {money(coverage)} / {money(quote.accountAmount)} RWF allocated
              {coverage > quote.accountAmount
                ? " · Reduce backing to match the loan."
                : coverage < quote.accountAmount
                  ? ` · ${money(quote.accountAmount - coverage)} RWF remaining`
                  : " · Fully covered"}
            </p>
          </>
        )}
        {step === reviewStep && (
          <>
            <div className="finance-review-intro">
              <strong>
                {kind === "withdrawal"
                  ? t("Savings withdrawal", "Kubikuza ubwizigame")
                  : backed
                    ? t("Member-backed loan", "Inguzanyo ifashijwe")
                    : t("Savings-backed loan", "Inguzanyo ku bwizigame")}
              </strong>
              <span>
                {t("To", "Kuri")} {phone}
                {kind === "loan" ? ` · ${months || rule.maxMonths} months` : ""}
              </span>
            </div>
            <FeeSummary amount={numericAmount} feeBps={config.feeBps} direction="payout" loan={kind === "loan"} />
            {kind === "loan" && (
              <>
                <div className="finance-processing-callout">
                  <strong>
                    {t("Processing fee", "Ikiguzi cy’inguzanyo")}: {money(fee)} RWF
                  </strong>
                  <p>
                    {fee > 0
                      ? t(
                          `Deducted from your available savings when you submit. Available savings after the fee: ${money(position.available - fee)} RWF. This fee is non-refundable, even if the loan is declined or cancelled.`,
                          `Bikurwa mu bwizigame bwawe wohereje ubusabe. Hasigara ${money(position.available - fee)} RWF. Ntibisubizwa ubusabe bwanzwe cyangwa bwahagaritswe.`,
                        )
                      : t("No processing fee applies to this request.", "Nta kiguzi cy’inguzanyo kuri ubu busabe.")}
                  </p>
                </div>
                <div className="finance-rate-line">
                  <strong>
                    {rule.rateBps / 100}%{" "}
                    {rule.periodMonths === 1
                      ? t("monthly", "buri kwezi")
                      : t(`every ${rule.periodMonths} months`, `buri mezi ${rule.periodMonths}`)}
                  </strong>
                  <span>
                    {rule.method} {t("interest", "inyungu")}
                  </span>
                </div>
                <details className="finance-details">
                  <summary>
                    {t("Full loan terms & backing", "Amabwiriza yose n’ubufasha")}
                    <ChevronDown size={14} />
                  </summary>
                  <LoanTermsSummary terms={terms} months={Number(months || rule.maxMonths)} />
                  {backed &&
                    backers.map((b) => (
                      <p key={b.code}>
                        {b.code} · {money(Number(b.amount))} RWF backing
                      </p>
                    ))}
                </details>
                <label className="penalty-check">
                  <input type="checkbox" required />
                  {fee > 0
                    ? t(
                        "I agree to the loan terms and to deduct the non-refundable processing fee from my savings, and reserve my own backing.",
                        "Nemeye amabwiriza, gukura ikiguzi kidasubizwa mu bwizigame no gufata ubufasha bwanjye.",
                      )
                    : t(
                        "I agree to the loan terms and reserve my own backing.",
                        "Nemeye amabwiriza no gufata ubufasha bwanjye.",
                      )}
                </label>
              </>
            )}
          </>
        )}
        <div className="finance-task-footer">
          {step > 0 && (
            <Action secondary disabled={action.pending} onClick={() => setStep(step - 1)}>
              {t("Back", "Subira")}
            </Action>
          )}
          <Action
            type="submit"
            busy={action.pending}
            disabled={
              !loaded ||
              feeUnavailable ||
              limitExceeded ||
              (kind === "loan" && !rule.enabled) ||
              (step > 0 && coverageInvalid)
            }
          >
            {step < reviewStep ? t("Continue", "Komeza") : t("Submit request", "Ohereza ubusabe")}
            <ArrowRight size={16} />
          </Action>
        </div>
        {action.feedback}
      </form>
    </>
  );
}
function BackerPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [matches, setMatches] = useState<{ code: string; name: string }[]>([]);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (value.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      searchLoanBackers(value)
        .then((rows) => {
          if (active) setMatches(rows);
        })
        .catch(() => {
          if (active) setMatches([]);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value]);
  return (
    <div className="field loan-backer-picker">
      Backing member
      <input
        required
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setFocused(true);
        }}
        placeholder="Search name or member code"
        aria-label="Backing member"
      />
      {focused && value.length >= 2 && (
        <div className="loan-backer-matches">
          {matches.map((m) => (
            <button
              type="button"
              key={m.code}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(m.code);
                setFocused(false);
              }}
            >
              {m.name} · {m.code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function BackingInvitations({ data, onChanged }: { data: FinanceData; onChanged: () => void }) {
  const action = useFinanceAction(onChanged);
  return (
    <>
      {!data.invitations.length && <EmptyState text="No backing invitations or commitments" />}
      {data.invitations.map((b) => (
        <article className="finance-record" key={b.id}>
          <div>
            <strong>
              {b.borrowerName} · {b.borrowerCode}
            </strong>
            <p>
              Your backing: {money(b.amount)} RWF · Loan principal: {money(b.loanPrincipal)} RWF
            </p>
            <p>
              {b.mode === "lock"
                ? "Savings will be locked against withdrawal."
                : "Savings will be deducted at payout and restored by repayment."}{" "}
              Released: {money(b.releasedAmount)} RWF
            </p>
            {!b.processingFeeReady && <p>Waiting for the borrower to pay the processing fee.</p>}
            {b.terms && (
              <details className="finance-details">
                <summary>
                  Loan terms
                  <ChevronDown size={14} />
                </summary>
                <LoanTermsSummary terms={b.terms} months={b.repaymentMonths!} />
              </details>
            )}
          </div>
          <div className="finance-record-actions">
            <span className="status-pill">
              {b.status} · {b.loanStatus}
            </span>
            {b.status === "pending" && b.loanStatus === "requested" && (
              <>
                <Action
                  disabled={!b.processingFeeReady}
                  busy={action.pending}
                  onClick={() =>
                    action.execute(
                      () => replyToLoanBacking(b.id, true),
                      "Backing approved and reserved from your pool.",
                    )
                  }
                >
                  Approve {money(b.amount)} RWF backing
                </Action>
                <Action
                  secondary
                  busy={action.pending}
                  onClick={() =>
                    action.execute(
                      () => replyToLoanBacking(b.id, false),
                      "Backing declined; the funding plan has been closed.",
                    )
                  }
                >
                  Decline backing
                </Action>
              </>
            )}
          </div>
        </article>
      ))}
      {action.feedback}
    </>
  );
}
function PaymentList({
  payments,
  onChanged,
  admin = false,
}: {
  payments: Payment[];
  onChanged: () => void;
  admin?: boolean;
}) {
  const t = useT();
  const action = useFinanceAction(onChanged);
  return (
    <>
      {!payments.length && <EmptyState text={t("No mobile money payments yet", "Nta bwishyu kuri telefoni buraba")} />}
      {payments.map((p) => (
        <article key={p.id} className="finance-record">
          <div>
            <strong>
              {money(p.amount)} RWF · <FinanceLabel value={p.purpose} />
            </strong>
            <small>
              {p.msisdn} · {p.createdAt.slice(0, 10)} · {p.id.slice(0, 8)}
              {p.mode === "test" ? " · TEST" : ""}
            </small>
            {p.failureMessage && <p className="form-error">{p.failureMessage}</p>}
            <small className="danger-text">
              {t("Provider fee", "Ikiguzi")}: {money(["created", "pending"].includes(p.status) ? p.quotedFee : p.fee)}{" "}
              RWF{p.feePolicy === "member" ? ` · ${t("Paid by member", "Yishyurwa n’umunyamuryango")}` : ""}
            </small>
            {p.status === "succeeded" && p.appliedAmount !== null && (
              <small>
                {t("Recorded amount", "Amafaranga yanditswe")}: {money(p.appliedAmount)} RWF
              </small>
            )}
          </div>
          <div className="finance-record-actions">
            <Status value={p.status} />
            {["created", "pending"].includes(p.status) && (admin || p.direction === "collect" || p.providerId) && (
              <Action
                secondary
                busy={action.pending}
                onClick={() =>
                  action.execute(() => checkMobilePayment(p.id), t("Payment status checked.", "Ubwishyu bwasuzumwe."))
                }
              >
                {t("Check status", "Reba uko bihagaze")}
              </Action>
            )}
          </div>
        </article>
      ))}
      {action.feedback}
    </>
  );
}
function FinanceLabel({ value }: { value: string }) {
  const t = useT();
  const labels: Record<string, [string, string]> = {
    savings: ["Savings", "Ubwizigame"],
    social: ["Social contribution", "Ingoboka"],
    penalty: ["Penalty", "Amande"],
    loan_fee: ["Loan processing fee", "Ikiguzi cy’inguzanyo"],
    loan_repayment: ["Loan repayment", "Kwishyura inguzanyo"],
    loan: ["Loan", "Inguzanyo"],
    withdrawal: ["Savings withdrawal", "Kubikuza"],
  };
  return <>{labels[value] ? t(...labels[value]) : value}</>;
}
function Status({ value }: { value: string }) {
  const t = useT();
  const labels: Record<string, [string, string]> = {
    created: ["Awaiting confirmation", "Bitegereje kwemezwa"],
    pending: ["Processing", "Biracyakorwa"],
    succeeded: ["Completed", "Byarangiye"],
    failed: ["Failed", "Byanze"],
    cancelled: ["Cancelled", "Byahagaritswe"],
    requested: ["Awaiting review", "Bitegereje isuzuma"],
    approved: ["Approved", "Byemejwe"],
    rejected: ["Declined", "Byanzwe"],
    paid: ["Disbursed", "Byishyuwe"],
  };
  return (
    <span className={`status-pill ${["paid", "succeeded"].includes(value) ? "" : "amber"}`}>
      {labels[value] ? t(...labels[value]) : value}
    </span>
  );
}
function ProcessingFeeForm({
  request,
  onChanged,
  onComplete,
}: {
  request: Request;
  onChanged: () => void;
  onComplete: () => void;
}) {
  const action = useFinanceAction(onChanged);
  return (
    <form
      className="portal-form"
      onSubmit={(e) => {
        e.preventDefault();
        action.execute(() => deductLoanProcessingFee(request.id), "Processing fee deducted from savings.", onComplete);
      }}
    >
      <div className="finance-total">
        <span>Deduct from available savings</span>
        <strong>{money(request.processingFeeRemaining)} RWF</strong>
      </div>
      <p className="finance-task-hint">
        This earlier request has an unpaid fee. Confirm the deduction from your available savings so the loan can
        proceed.
      </p>
      <label className="penalty-check">
        <input type="checkbox" required />I agree to deduct this non-refundable fee from my savings. It is retained if
        the loan is declined or cancelled.
      </label>
      <Action type="submit" busy={action.pending}>
        Confirm savings deduction
      </Action>
      {action.feedback}
    </form>
  );
}
function RequestList({
  data,
  config,
  onChanged,
  admin = false,
}: {
  data: FinanceData;
  config: Config;
  onChanged: () => void;
  admin?: boolean;
}) {
  const t = useT();
  const dateLabel = useDateLabel();
  const role = usePortal().viewer.role;
  const action = useFinanceAction(onChanged);
  const [review, setReview] = useState<Request | null>(null);
  const [payout, setPayout] = useState<Request | null>(null);
  const [feeRequest, setFeeRequest] = useState<Request | null>(null);
  const [accepting, setAccepting] = useState<Request | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  return (
    <>
      {!data.requests.length && <EmptyState text={t("No requests yet", "Nta busabe buraba")} />}
      {data.requests.map((r) => {
        const open = expanded.includes(r.id);
        const payment = data.payments.find(
          (p) =>
            p.requestId === r.id && p.direction === "payout" && ["created", "pending", "succeeded"].includes(p.status),
        );
        const feePending = data.payments.some(
          (p) => p.requestId === r.id && p.purpose === "loan_fee" && ["created", "pending"].includes(p.status),
        );
        const backings = data.backings.filter((b) => b.requestId === r.id);
        const needsFee = r.status === "requested" && r.kind === "loan" && r.processingFeeRemaining > 0;
        const status = payment?.status === "pending" || payment?.status === "created" ? payment.status : r.status;
        const nextStep =
          r.status === "requested" && r.kind === "loan"
            ? needsFee
              ? feePending
                ? t("Confirming your processing fee", "Ikiguzi cyawe kiracyemezwa")
                : t("Processing fee needed", "Ikiguzi cy’inguzanyo kirakenewe")
              : !r.fundingReady
                ? t("Waiting for backing approval", "Bitegereje kwemezwa k’ubufasha")
                : t("Ready for manager review", "Biteguye isuzuma ry’umuyobozi")
            : r.status === "approved"
              ? r.kind === "loan" && !r.termsAcceptedAt
                ? t(
                    "Your loan is approved. Accept the terms to continue.",
                    "Inguzanyo yemejwe. Emeza ibisabwa kugira ngo ukomeze.",
                  )
                : t("Approved. Your payout is being arranged.", "Byemejwe. Amafaranga yawe arategurwa.")
              : null;
        return (
          <article className="request-activity-card" key={r.id} aria-labelledby={`request-title-${r.id}`}>
            <header className="request-card-header">
              <span className="request-card-icon" aria-hidden="true">
                {r.kind === "loan" ? <HandCoins size={21} /> : <ArrowDownLeft size={21} />}
              </span>
              <div className="request-card-title">
                <h3 id={`request-title-${r.id}`}>
                  {r.loanType === "savings" ? (
                    t("Savings-backed loan", "Inguzanyo ku bwizigame")
                  ) : r.loanType === "backed" ? (
                    t("Member-backed loan", "Inguzanyo ifashwa n’abanyamuryango")
                  ) : (
                    <FinanceLabel value={r.kind} />
                  )}
                </h3>
                <span>
                  {admin && `${r.memberName} · ${r.memberCode} · `}
                  <time dateTime={r.createdAt}>{dateLabel(r.createdAt.slice(0, 10))}</time>
                  <span aria-hidden="true"> · </span>
                  <span className="request-reference">#{r.id.slice(0, 8)}</span>
                </span>
              </div>
              <div className={`request-card-status ${needsFee ? "needs-action" : status}`}>
                <span aria-hidden="true" />
                {needsFee ? (
                  feePending ? (
                    t("Confirming fee", "Ikiguzi kiracyemezwa")
                  ) : (
                    t("Action needed", "Hari icyo gukora")
                  )
                ) : (
                  <Status value={status} />
                )}
              </div>
            </header>
            <dl className="request-card-metrics">
              <div className="request-card-amount">
                <dt>{t("Requested amount", "Amafaranga yasabwe")}</dt>
                <dd>
                  {money(r.payoutAmount ?? r.amount)} <span>RWF</span>
                </dd>
              </div>
              {r.outstanding !== null ? (
                <div>
                  <dt>{t("Outstanding", "Asigaye kwishyurwa")}</dt>
                  <dd>
                    {money(r.outstanding)} <span>RWF</span>
                  </dd>
                  {r.dueAt && (
                    <span className={r.overdueDays > 0 ? "request-overdue" : "request-metric-note"}>
                      {t("Due", "Kwishyura bitarenze")} {dateLabel(r.dueAt.slice(0, 10))}
                      {r.overdueDays > 0 &&
                        ` · ${t(`${r.overdueDays} days overdue`, `Iminsi ${r.overdueDays} y’ubukererwe`)}`}
                    </span>
                  )}
                </div>
              ) : (
                r.loanTerms && (
                  <div>
                    <dt>{t("Interest rate", "Igipimo cy’inyungu")}</dt>
                    <dd>
                      {r.loanTerms.rateBps / 100}%{" "}
                      <span>
                        {r.loanTerms.periodMonths === 1
                          ? t("/ month", "/ ukwezi")
                          : t(`/ ${r.loanTerms.periodMonths} months`, `/ amezi ${r.loanTerms.periodMonths}`)}
                      </span>
                    </dd>
                  </div>
                )
              )}
              {r.kind === "loan" && r.repaymentMonths !== null && (
                <div>
                  <dt>{t("Repayment period", "Igihe cyo kwishyura")}</dt>
                  <dd>
                    {r.repaymentMonths} <span>{t("months", "amezi")}</span>
                  </dd>
                </div>
              )}
            </dl>
            {(nextStep || payment?.status === "pending" || payment?.status === "created") && (
              <div className={`request-card-next ${needsFee ? "needs-action" : ""}`}>
                <span className="request-next-icon" aria-hidden="true">
                  {needsFee && !feePending ? <Coins size={18} /> : <Clock3 size={18} />}
                </span>
                <div>
                  <strong>
                    {payment?.status === "pending" || payment?.status === "created"
                      ? t("Payout in progress", "Amafaranga aracyoherezwa")
                      : nextStep}
                  </strong>
                  {needsFee && (
                    <span>
                      {money(r.processingFeeRemaining)} RWF · {t("Non-refundable", "Ntisubizwa")}
                    </span>
                  )}
                </div>
                <div className="request-primary-actions">
                  {!admin && needsFee && !feePending && (
                    <Action onClick={() => setFeeRequest(r)}>
                      {t("Deduct fee from savings", "Kura ikiguzi mu bwizigame")}
                      <ArrowRight size={15} />
                    </Action>
                  )}
                  {admin &&
                    r.status === "requested" &&
                    (r.kind === "loan" ? canApproveLoans(role) : canEditRecords(role)) && (
                      <Action secondary onClick={() => setReview(r)}>
                        {t("Review request", "Suzuma ubusabe")}
                      </Action>
                    )}
                  {!admin && r.kind === "loan" && r.status === "approved" && !r.termsAcceptedAt && (
                    <Action onClick={() => setAccepting(r)}>
                      {t("Review & accept terms", "Suzuma wemeze ibisabwa")}
                      <ArrowRight size={15} />
                    </Action>
                  )}
                  {admin && canEditRecords(role) && r.status === "approved" && !payment && (
                    <Action
                      disabled={
                        !config.configured || config.mode !== "live" || (r.kind === "loan" && !r.termsAcceptedAt)
                      }
                      onClick={() => setPayout(r)}
                    >
                      {t("Send payout", "Ohereza amafaranga")}
                    </Action>
                  )}
                </div>
              </div>
            )}
            {admin && r.status === "requested" && r.kind !== "loan" && canEditRecords(role) && (
              <div className="request-primary-actions request-review-action">
                <Action secondary onClick={() => setReview(r)}>
                  {t("Review request", "Suzuma ubusabe")}
                </Action>
              </div>
            )}
            <div className="request-card-details">
              <div className="request-card-toolbar">
                <button
                  type="button"
                  className="request-details-toggle"
                  aria-expanded={open}
                  aria-controls={`request-details-${r.id}`}
                  onClick={() => setExpanded((ids) => (open ? ids.filter((id) => id !== r.id) : [...ids, r.id]))}
                >
                  {open ? t("Hide details", "Hisha amakuru") : t("Request details", "Amakuru y’ubusabe")}
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                {(!admin || canEditRecords(role)) && ["requested", "approved"].includes(r.status) && !payment && (
                  <Action
                    secondary
                    className="request-cancel-action"
                    busy={action.pending}
                    onClick={() =>
                      action.execute(() => cancelFundsRequest(r.id), t("Request cancelled.", "Ubusabe bwahagaritswe."))
                    }
                  >
                    {t("Cancel request", "Hagarika ubusabe")}
                  </Action>
                )}
              </div>
              <div className="request-details-body" id={`request-details-${r.id}`} hidden={!open}>
                <div className="request-detail-columns">
                  <section>
                    <h4>{t("About this request", "Amakuru y’ubu busabe")}</h4>
                    <dl className="request-detail-list">
                      <div>
                        <dt>{t("Reason", "Impamvu")}</dt>
                        <dd>{r.reason}</dd>
                      </div>
                      <div>
                        <dt>{t("Receiving phone", "Telefoni yakira")}</dt>
                        <dd>{r.msisdn}</dd>
                      </div>
                      {r.reviewNote && (
                        <div>
                          <dt>{t("Review note", "Ibisobanuro by’isuzuma")}</dt>
                          <dd>{r.reviewNote}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                  <section>
                    <h4>{t("Amount breakdown", "Ibisobanuro by’amafaranga")}</h4>
                    <dl className="request-detail-list">
                      <div>
                        <dt>{t("Wallet amount", "Amafaranga kuri telefoni")}</dt>
                        <dd>{money(r.payoutAmount ?? r.amount)} RWF</dd>
                      </div>
                      {r.feePolicy === "member" && (
                        <>
                          <div>
                            <dt>{t("Provider fee", "Ikiguzi cya telefoni")}</dt>
                            <dd className="danger-text">{money(r.quotedFee)} RWF</dd>
                          </div>
                          <div className="request-detail-total">
                            <dt>
                              {r.kind === "loan"
                                ? t("Loan principal", "Inguzanyo shingiro")
                                : t("Account cost", "Ayakurwaho kuri konti")}
                            </dt>
                            <dd>{money(r.amount)} RWF</dd>
                          </div>
                        </>
                      )}
                      {r.processingFeeAmount > 0 && (
                        <div>
                          <dt>
                            {t("Processing fee", "Ikiguzi cy’inguzanyo")}
                            <span>{t("Non-refundable", "Ntisubizwa")}</span>
                          </dt>
                          <dd>
                            {money(r.processingFeeAmount)} RWF
                            <span className={r.processingFeeRemaining > 0 ? "request-fee-unpaid" : "request-fee-paid"}>
                              {r.processingFeeRemaining > 0
                                ? t(
                                    `${money(r.processingFeeRemaining)} RWF unpaid`,
                                    `${money(r.processingFeeRemaining)} RWF atarishyurwa`,
                                  )
                                : t("Paid", "Byishyuwe")}
                            </span>
                          </dd>
                        </div>
                      )}
                      {r.kind === "loan" && !r.loanTerms && r.interestAmount !== null && (
                        <>
                          <div>
                            <dt>{t("Interest", "Inyungu")}</dt>
                            <dd>{money(r.interestAmount)} RWF</dd>
                          </div>
                          <div>
                            <dt>{t("Total repayment", "Igiteranyo cyo kwishyura")}</dt>
                            <dd>{money(r.amount + r.interestAmount)} RWF</dd>
                          </div>
                          <div>
                            <dt>{t("Repayment period", "Igihe cyo kwishyura")}</dt>
                            <dd>
                              {r.repaymentMonths} {t("months after disbursement", "amezi nyuma yo guhabwa amafaranga")}
                            </dd>
                          </div>
                        </>
                      )}
                      {r.dueAt && (
                        <>
                          <div>
                            <dt>{t("Principal remaining", "Inguzanyo shingiro isigaye")}</dt>
                            <dd>{money(r.principalRemaining ?? 0)} RWF</dd>
                          </div>
                          <div>
                            <dt>{t("Interest remaining", "Inyungu zisigaye")}</dt>
                            <dd>{money(r.interestRemaining ?? 0)} RWF</dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </section>
                </div>
                {backings.length > 0 && (
                  <section className="request-backing-section">
                    <h4>
                      <ShieldCheck size={15} aria-hidden="true" />
                      {t("Savings backing", "Ubwizigame bufasha")}
                    </h4>
                    <ul>
                      {backings.map((b) => (
                        <li key={b.id}>
                          <div>
                            <strong>{b.isBorrower ? t("Your savings", "Ubwizigame bwawe") : b.memberName}</strong>
                            <span>
                              {b.isBorrower
                                ? admin
                                  ? b.memberName
                                  : t("Own pool", "Ubwizigame bwawe")
                                : t("Member backing", "Ubufasha bw’umunyamuryango")}
                            </span>
                          </div>
                          <strong>
                            {money(b.amount)} <span>RWF</span>
                          </strong>
                          <span className={`request-backing-status ${b.status}`}>
                            {b.status === "approved" ? (
                              <Check size={13} aria-hidden="true" />
                            ) : (
                              <Clock3 size={13} aria-hidden="true" />
                            )}
                            {b.status === "approved"
                              ? t("Approved", "Byemejwe")
                              : b.status === "declined"
                                ? t("Declined", "Byanzwe")
                                : t("Pending", "Bitegereje")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {r.loanTerms && (
                  <details className="finance-details request-terms-details">
                    <summary>
                      {t("Full loan terms", "Amabwiriza yose y’inguzanyo")}
                      <ChevronDown size={14} aria-hidden="true" />
                    </summary>
                    <LoanTermsSummary
                      terms={{ ...r.loanTerms, processingFeeSource: r.processingFeeSource }}
                      months={r.repaymentMonths!}
                    />
                  </details>
                )}
                {r.termsAcceptedAt && (
                  <span className="request-terms-accepted">
                    <Check size={14} aria-hidden="true" />
                    {t("Loan terms accepted", "Ibisabwa ku nguzanyo byemejwe")}
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
      {action.feedback}
      <Dialog
        open={!!feeRequest}
        onOpenChange={(open) => {
          if (!open) setFeeRequest(null);
        }}
      >
        <DialogContent className="portal-dialog money-task-dialog">
          <DialogHeader>
            <DialogTitle>Deduct processing fee from savings</DialogTitle>
            <DialogDescription>
              This fee is non-refundable, even if your loan is declined or cancelled.
            </DialogDescription>
          </DialogHeader>
          {feeRequest && (
            <ProcessingFeeForm request={feeRequest} onChanged={onChanged} onComplete={() => setFeeRequest(null)} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!accepting}
        onOpenChange={(open) => {
          if (!open && !action.pending) setAccepting(null);
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>Review your approved loan</DialogTitle>
            <DialogDescription>Read the agreed terms before accepting disbursement.</DialogDescription>
          </DialogHeader>
          {accepting && (
            <>
              <p>
                {money(accepting.amount)} RWF principal · {accepting.repaymentMonths} months
              </p>
              {accepting.loanTerms ? (
                <LoanTermsSummary
                  terms={{ ...accepting.loanTerms, processingFeeSource: accepting.processingFeeSource }}
                  months={accepting.repaymentMonths!}
                />
              ) : (
                <p>
                  Interest: {money(accepting.interestAmount ?? 0)} RWF · Total repayment:{" "}
                  {money(accepting.amount + (accepting.interestAmount ?? 0))} RWF
                </p>
              )}
              {accepting.reviewNote && <p>{accepting.reviewNote}</p>}
              <Action
                busy={action.pending}
                onClick={() =>
                  action.execute(
                    () => acceptLoanTerms(accepting.id),
                    "Terms accepted. Your loan is ready for disbursement.",
                    () => setAccepting(null),
                  )
                }
              >
                Accept loan terms
              </Action>
              {action.feedback}
            </>
          )}
        </DialogContent>
      </Dialog>
      <ReviewDialog request={review} onClose={() => setReview(null)} onChanged={onChanged} />
      <Dialog
        open={!!payout}
        onOpenChange={(open) => {
          if (!open && !action.pending) setPayout(null);
        }}
      >
        <DialogContent className="portal-dialog">
          <DialogHeader>
            <DialogTitle>{t("Confirm mobile money payout", "Emeza kohereza amafaranga")}</DialogTitle>
            <DialogDescription>
              {t(
                "Confirm the destination and amount before sending. A completed payout cannot be reversed.",
                "Emeza telefoni n’amafaranga mbere yo kohereza. Ubwishyu bwageze kuri telefoni ntibushobora gusubizwa.",
              )}
            </DialogDescription>
          </DialogHeader>
          {payout && (
            <>
              <p>
                <strong>
                  {payout.memberCode} · {payout.memberName}
                </strong>
              </p>
              <div className="finance-total">
                <span>{payout.msisdn}</span>
                <strong>{money(payout.payoutAmount ?? payout.amount)} RWF</strong>
              </div>
              <p className="muted">
                {payout.feePolicy === "member"
                  ? t(
                      `Member-paid provider fee: ${money(payout.quotedFee)} RWF. Total account cost: ${money(payout.amount)} RWF.`,
                      `Ikiguzi cy’umunyamuryango: ${money(payout.quotedFee)} RWF. Igiteranyo: ${money(payout.amount)} RWF.`,
                    )
                  : t(
                      "This earlier request uses the fee terms agreed when it was submitted.",
                      "Ubu busabe bukoresha ikiguzi cyumvikanyweho igihe bwoherezwaga.",
                    )}
              </p>
              <Action
                busy={action.pending}
                onClick={() =>
                  action.execute(
                    () => payApprovedRequest(payout.id),
                    t(
                      "Payout submitted. Follow its status in payment activity.",
                      "Ubwishyu bwoherejwe. Kurikirana uko buhagaze.",
                    ),
                    () => setPayout(null),
                  )
                }
              >
                {t("Confirm & send", "Emeza kandi wohereze")}
                <ArrowRight size={16} />
              </Action>
              {action.feedback}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function ReviewDialog({
  request,
  onClose,
  onChanged,
}: {
  request: Request | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="portal-dialog">
        <DialogHeader>
          <DialogTitle>{t("Review funds request", "Suzuma ubusabe bw’amafaranga")}</DialogTitle>
          <DialogDescription>
            {t(
              "Approve the amount requested or decline with a reason. Loan terms require member acceptance before payout.",
              "Emeza amafaranga yasabwe cyangwa uyange usobanure impamvu. Umunyamuryango yemeza ibisabwa ku nguzanyo mbere yo kuyihabwa.",
            )}
          </DialogDescription>
        </DialogHeader>
        {request && <ReviewForm key={request.id} request={request} onClose={onClose} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  );
}
function ReviewForm({ request, onClose, onChanged }: { request: Request; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const [interest, setInterest] = useState("0");
  const [months, setMonths] = useState("12");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("approve");
  const action = useFinanceAction(onChanged);
  return (
    <form
      className="portal-form"
      onSubmit={(e) => {
        e.preventDefault();
        action.execute(
          () =>
            reviewFunds({
              id: request.id,
              approve: decision === "approve",
              note,
              interestAmount: Number(interest),
              repaymentMonths: Number(months),
            }),
          t("Review saved.", "Isuzuma ryabitswe."),
          onClose,
        );
      }}
    >
      <p>
        <strong>
          {request.memberCode} · {money(request.amount)} RWF
        </strong>
      </p>
      <p>{request.reason}</p>
      {request.kind === "loan" && !request.fundingReady && (
        <p>
          Approval waits for confirmed processing fee payment and all backing consents. You may decline with a reason.
        </p>
      )}
      {request.loanTerms && <LoanTermsSummary terms={request.loanTerms} months={request.repaymentMonths!} />}
      <label className="field">
        {t("Decision", "Icyemezo")}
        <Choice
          ariaLabel="Decision"
          value={decision}
          onChange={setDecision}
          options={[
            { value: "approve", label: t("Approve", "Emeza") },
            { value: "reject", label: t("Decline", "Anga") },
          ]}
        />
      </label>
      {request.kind === "loan" && !request.loanTerms && decision === "approve" && (
        <>
          <label className="field">
            {t("Total interest (RWF)", "Inyungu zose (RWF)")}
            <input
              type="number"
              min="0"
              max="100000000"
              step="1"
              required
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
            />
          </label>
          <label className="field">
            {t("Repayment period (months)", "Igihe cyo kwishyura (amezi)")}
            <input
              type="number"
              min="1"
              max="120"
              step="1"
              required
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </label>
          <p>
            {t("Total to repay", "Igiteranyo cyo kwishyura")}:{" "}
            <strong>{money(request.amount + Number(interest))} RWF</strong>
          </p>
        </>
      )}
      <label className="field">
        {t("Review note / agreed conditions", "Ibisobanuro n’ibisabwa")}
        <textarea
          required
          minLength={3}
          maxLength={500}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <Action
        type="submit"
        disabled={decision === "approve" && request.kind === "loan" && !request.fundingReady}
        busy={action.pending}
      >
        {t("Save review", "Bika isuzuma")}
      </Action>
      {action.feedback}
    </form>
  );
}
export function AdminMobileMoney({ data, config }: { data: FinanceData; config: Config }) {
  const t = useT();
  const router = useRouter();
  // Refresh server-rendered request queues after every mutation.
  const refresh = () => router.refresh();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("PAYMENTS & DISBURSEMENTS", "UBWISHYU N’INGUZANYO")}</span>
          <h1>
            {t("Payments", "Ubwishyu")}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {t(
              "Review contribution receipts, funds requests and payouts.",
              "Suzuma ubusabe, wemeze ibisabwa ku nguzanyo kandi ukurikirane ubwishyu.",
            )}
          </p>
        </div>
        <Action secondary onClick={refresh}>
          <RefreshCw size={16} />
          {t("Refresh", "Vugurura")}
        </Action>
      </div>
      <section className="panel finance-section">
        <SectionHeading
          title={t("Contribution receipts", "Inyemezabwishyu z’imisanzu")}
          subtitle={t(
            "The secretary verifies payments made outside Elayo before crediting contributions.",
            "Umunyamabanga asuzuma ubwishyu bwakozwe hanze ya Elayo mbere yo kwandika imisanzu.",
          )}
        />
        <ContributionProofList proofs={data.proofs} onChanged={refresh} admin />
      </section>
      <section className="panel finance-section">
        <SectionHeading title={t("Funds requests", "Ubusabe bw’amafaranga")} action={<Wallet size={20} />} />
        <RequestList data={data} config={config} onChanged={refresh} admin />
      </section>
      <ConnectionNotice config={config} />
      <section className="panel finance-section">
        <SectionHeading title={t("Collections & payouts", "Kwakira no kohereza")} />
        <PaymentList payments={data.payments} onChanged={refresh} admin />
      </section>
    </>
  );
}
