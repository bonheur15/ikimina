import { z } from "zod";

export const interestRule = z
  .object({
    enabled: z.boolean(),
    rateBps: z.number().int().min(0).max(10000),
    periodMonths: z.number().int().min(1).max(12),
    maxMonths: z.number().int().min(1).max(120),
    minAmount: z.number().int().min(10000).max(100000000),
    maxAmount: z.number().int().min(10000).max(100000000),
    method: z.enum(["simple", "compound"]),
    base: z.enum(["remaining", "original"]),
    prorate: z.boolean(),
    dayBasis: z.enum(["calendar", "30_day"]),
    rounding: z.enum(["ceil", "nearest", "floor"]),
    accrueAfterDue: z.boolean(),
  })
  .refine((v) => v.maxAmount >= v.minAmount, "Maximum loan must be at least the minimum.");
export const loanPolicySchema = z
  .object({
    processingFeeBps: z.number().int().min(0).max(10000).default(100),
    version: z.string().min(1),
    savings: interestRule,
    backed: interestRule,
    savingsLimitBps: z.number().int().min(1).max(10000),
    backerLimitBps: z.number().int().min(1).max(10000),
    backingMode: z.enum(["lock", "deduct"]),
    release: z.enum(["proportional", "full_repayment"]),
    minBackers: z.number().int().min(1).max(20),
    maxBackers: z.number().int().min(1).max(20),
    repaymentOrder: z.enum(["interest_first", "principal_first"]),
    graceDays: z.number().int().min(0).max(365),
    allowSelfApproval: z.boolean().default(false),
  })
  .refine((v) => v.maxBackers >= v.minBackers, "Maximum backers must be at least the minimum.");
export type LoanPolicy = z.infer<typeof loanPolicySchema>;
export type LoanTerms = z.infer<typeof interestRule> & {
  version: string;
  repaymentOrder: LoanPolicy["repaymentOrder"];
  graceDays: number;
  release: LoanPolicy["release"];
  backingMode: LoanPolicy["backingMode"];
  savingsLimitBps: number;
  backerLimitBps: number;
  allowSelfApproval: boolean;
  processingFeeBps?: number;
  processingFeeSource?: "savings" | "mobile_money" | "mixed";
};
const common = {
  enabled: true,
  maxMonths: 12,
  minAmount: 10000,
  maxAmount: 100000000,
  method: "simple" as const,
  base: "remaining" as const,
  prorate: true,
  dayBasis: "calendar" as const,
  rounding: "ceil" as const,
  accrueAfterDue: true,
};
export const DEFAULT_LOAN_POLICY: LoanPolicy = {
  processingFeeBps: 100,
  version: "elayo-default-v1",
  savings: { ...common, rateBps: 100, periodMonths: 1 },
  backed: { ...common, rateBps: 500, periodMonths: 3 },
  savingsLimitBps: 8000,
  backerLimitBps: 8000,
  backingMode: "lock",
  release: "full_repayment",
  minBackers: 1,
  maxBackers: 20,
  repaymentOrder: "interest_first",
  graceDays: 0,
  allowSelfApproval: false,
};
export function termsFor(policy: LoanPolicy, type: "savings" | "backed"): LoanTerms {
  return {
    ...policy[type],
    processingFeeBps: policy.processingFeeBps,
    processingFeeSource: "savings",
    version: policy.version,
    repaymentOrder: policy.repaymentOrder,
    graceDays: policy.graceDays,
    release: policy.release,
    backingMode: policy.backingMode,
    savingsLimitBps: policy.savingsLimitBps,
    backerLimitBps: policy.backerLimitBps,
    allowSelfApproval: policy.allowSelfApproval,
  };
}
export function addLoanMonths(start: Date, months: number) {
  const result = new Date(start);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
const DAY = 86400000;
function fractionAt(start: Date, at: Date, terms: LoanTerms) {
  if (at <= start) return 0;
  if (terms.dayBasis === "30_day") return (at.getTime() - start.getTime()) / (DAY * 30 * terms.periodMonths);
  const rawMonths = (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth();
  let full = Math.floor(rawMonths / terms.periodMonths);
  if (addLoanMonths(start, full * terms.periodMonths) > at) full--;
  const from = addLoanMonths(start, full * terms.periodMonths),
    to = addLoanMonths(start, (full + 1) * terms.periodMonths);
  return full + (at.getTime() - from.getTime()) / (to.getTime() - from.getTime());
}
function round(value: number, mode: LoanTerms["rounding"]) {
  return mode === "ceil" ? Math.ceil(value - 1e-8) : mode === "floor" ? Math.floor(value + 1e-8) : Math.round(value);
}
export type Repayment = { id: string; amount: number; at: Date };
/** Pure calculation from immutable origination terms and confirmed repayments; no scheduler-dependent interest. */
export function calculateLoan(
  principal: number,
  startedAt: Date,
  months: number,
  terms: LoanTerms,
  payments: Repayment[],
  now = new Date(),
) {
  let remaining = principal,
    interest = 0,
    interestPaid = 0,
    principalPaid = 0,
    surplus = 0,
    cursor = startedAt;
  const dueAt = addLoanMonths(startedAt, months);
  const accrue = (until: Date) => {
    const end = terms.accrueAfterDue ? until : new Date(Math.min(until.getTime(), dueAt.getTime()));
    const startFraction = fractionAt(startedAt, cursor, terms),
      endFraction = fractionAt(startedAt, end, terms);
    const periods = Math.max(
      0,
      terms.prorate ? endFraction - startFraction : Math.floor(endFraction + 1e-10) - Math.floor(startFraction + 1e-10),
    );
    if (remaining > 0 || interest > 0) {
      const base = terms.base === "original" ? principal : remaining;
      interest +=
        terms.method === "simple"
          ? ((base * terms.rateBps) / 10000) * periods
          : (base + interest) * (Math.pow(1 + terms.rateBps / 10000, periods) - 1);
    }
    cursor = until;
  };
  for (const payment of payments.toSorted((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id))) {
    if (payment.at > now || payment.at < startedAt) continue;
    accrue(payment.at);
    interest = round(interest, terms.rounding);
    let amount = payment.amount;
    const payInterest = () => {
      const paid = Math.min(amount, interest);
      interest -= paid;
      amount -= paid;
      interestPaid += paid;
    };
    const payPrincipal = () => {
      const paid = Math.min(amount, remaining);
      remaining -= paid;
      amount -= paid;
      principalPaid += paid;
    };
    if (terms.repaymentOrder === "interest_first") {
      payInterest();
      payPrincipal();
    } else {
      payPrincipal();
      payInterest();
    }
    surplus += amount;
  }
  accrue(now);
  interest = round(interest, terms.rounding);
  const outstanding = remaining + interest;
  return {
    principalRemaining: remaining,
    principalPaid,
    interestRemaining: interest,
    interestPaid,
    outstanding,
    surplus,
    dueAt,
    overdueDays: outstanding ? Math.max(0, Math.ceil((now.getTime() - dueAt.getTime()) / DAY) - terms.graceDays) : 0,
  };
}
