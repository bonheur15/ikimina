"use client";
import type { LoanTerms } from "@/lib/loan-policy";
export function LoanTermsSummary({ terms, months }: { terms: LoanTerms; months: number }) {
  return (
    <div className="loan-terms-summary">
      <strong>
        {terms.rateBps / 100}% per {terms.periodMonths === 1 ? "month" : `${terms.periodMonths} months`} ·{" "}
        {terms.method} interest
      </strong>
      <p>
        {terms.base === "remaining"
          ? "Interest applies to unpaid principal."
          : "Interest applies to original principal."}{" "}
        {terms.prorate
          ? `Early repayment and partial periods are prorated using ${terms.dayBasis === "calendar" ? "the actual calendar period" : "30-day months"}.`
          : "Interest is charged for completed periods."}
      </p>
      {terms.processingFeeBps !== undefined && (
        <p>
          Processing fee: {terms.processingFeeBps / 100}% of the requested wallet amount,{" "}
          {terms.processingFeeSource === "savings"
            ? "deducted upfront from available savings and non-refundable."
            : terms.processingFeeSource === "mixed"
              ? "settled through a previous mobile money payment and a savings deduction; non-refundable."
              : "paid upfront under the original agreement and non-refundable."}
        </p>
      )}
      <p>
        Repay within {months} months after disbursement.{" "}
        {terms.accrueAfterDue ? "Interest continues after the due date." : "Interest stops at the due date."} Repayments
        cover {terms.repaymentOrder === "interest_first" ? "interest before principal" : "principal before interest"}.
      </p>
      <p>
        {terms.backingMode === "lock"
          ? "Backing savings remain in their owners’ balances and are locked against withdrawal."
          : "Backing savings are deducted at payout and restored by repayments."}{" "}
        {terms.release === "full_repayment"
          ? "Backing is released after full repayment."
          : "Backing is released as principal is repaid."}
      </p>
    </div>
  );
}
