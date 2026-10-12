import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  auditLog,
  financeRequests,
  ledgerEntries,
  loanBackings,
  members,
  mobilePayments,
  pushNotifications,
  settings,
  users,
} from "@/db/schema";
import { DEFAULT_LOAN_POLICY, calculateLoan, loanPolicySchema, termsFor } from "./loan-policy";
import { lockFinance, type FinanceTx } from "./finance-lock";
import { kigaliToday } from "./portal-data";

export class LoanError extends Error {}
type Request = typeof financeRequests.$inferSelect;
type Reader = Pick<FinanceTx, "select">;
export async function getLoanPolicy(reader: Reader = db) {
  const [row] = await reader.select().from(settings).where(eq(settings.key, "loanPolicy"));
  if (!row) return DEFAULT_LOAN_POLICY;
  const parsed = loanPolicySchema.safeParse(row.value);
  if (!parsed.success) throw new LoanError("The loan policy needs correction by superadmin.");
  return parsed.data;
}
export async function savingsPosition(reader: Reader, memberId: string) {
  const [saved] = await reader
    .select({ amount: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)`.mapWith(Number) })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.memberId, memberId),
        isNull(ledgerEntries.voidedAt),
        inArray(ledgerEntries.kind, ["savings", "adjustment"]),
      ),
    );
  const [withdrawals] = await reader
    .select({ amount: sql<number>`coalesce(sum(${financeRequests.amount}), 0)`.mapWith(Number) })
    .from(financeRequests)
    .where(
      and(
        eq(financeRequests.memberId, memberId),
        eq(financeRequests.kind, "withdrawal"),
        inArray(financeRequests.status, ["requested", "approved"]),
      ),
    );
  const [backing] = await reader
    .select({
      amount: sql<number>`coalesce(sum(${loanBackings.amount} - ${loanBackings.releasedAmount}), 0)`.mapWith(Number),
    })
    .from(loanBackings)
    .innerJoin(financeRequests, eq(financeRequests.id, loanBackings.requestId))
    .where(
      and(
        eq(loanBackings.memberId, memberId),
        eq(loanBackings.status, "approved"),
        sql`(${financeRequests.status} in ('requested', 'approved') or (${financeRequests.status} = 'paid' and ${loanBackings.mode} = 'lock'))`,
      ),
    );
  return {
    total: saved.amount,
    locked: backing.amount,
    withdrawals: withdrawals.amount,
    available: saved.amount - withdrawals.amount - backing.amount,
  };
}
export async function lendingCapacity(reader: Reader, memberId: string, limitBps: number) {
  const position = await savingsPosition(reader, memberId);
  return Math.max(0, Math.min(position.available, Math.floor((position.total * limitBps) / 10000) - position.locked));
}
export async function getLoanBalance(reader: Reader, loan: Request, now = new Date()) {
  const rows = await reader
    .select()
    .from(mobilePayments)
    .where(
      and(
        eq(mobilePayments.requestId, loan.id),
        eq(mobilePayments.purpose, "loan_repayment"),
        eq(mobilePayments.mode, "live"),
        eq(mobilePayments.status, "succeeded"),
      ),
    );
  const payments = rows.map((r) => ({
    id: r.id,
    amount: r.appliedAmount ?? (r.feePolicy === "member" ? r.amount - r.fee : r.amount),
    at: r.completedAt ?? r.createdAt,
  }));
  if (!loan.loanTerms || !loan.paidAt) {
    const paid = payments.reduce((n, p) => n + p.amount, 0),
      initialInterest = loan.interestAmount ?? 0;
    const principalPaid = Math.min(loan.amount, Math.max(0, paid - initialInterest));
    return {
      principalRemaining: loan.amount - principalPaid,
      principalPaid,
      interestRemaining: Math.max(0, initialInterest - paid),
      interestPaid: Math.min(paid, initialInterest),
      outstanding: Math.max(0, loan.amount + initialInterest - paid),
      surplus: Math.max(0, paid - loan.amount - initialInterest),
      dueAt: null,
      overdueDays: 0,
    };
  }
  return calculateLoan(loan.amount, loan.paidAt, loan.repaymentMonths!, loan.loanTerms, payments, now);
}
export async function queueLoanNotice(tx: FinanceTx, memberId: string, event: string, title: string, body: string) {
  const [config] = await tx.select().from(settings).where(eq(settings.key, "notificationPolicy"));
  if ((config?.value as { loanUpdates?: boolean } | undefined)?.loanUpdates === false) return;
  const recipients = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.memberId, memberId), isNull(users.disabledAt)));
  for (const user of recipients)
    await tx
      .insert(pushNotifications)
      .values({ userId: user.id, eventKey: `${event}:${user.id}`, title, body, path: "/member?view=money" })
      .onConflictDoNothing();
}

export async function processingFeeRemaining(reader: Reader, loan: Request) {
  const [paid] = await reader
    .select({ amount: sql<number>`coalesce(sum(${mobilePayments.appliedAmount}), 0)`.mapWith(Number) })
    .from(mobilePayments)
    .where(
      and(
        eq(mobilePayments.requestId, loan.id),
        eq(mobilePayments.purpose, "loan_fee"),
        eq(mobilePayments.mode, "live"),
        eq(mobilePayments.status, "succeeded"),
      ),
    );
  return Math.max(0, loan.processingFeeAmount - loan.processingFeeDeductedAmount - paid.amount);
}

/** Reclassifies the member's saved money as a fee. No cash enters or leaves the group. */
export async function chargeLoanProcessingFee(tx: FinanceTx, loan: Request, actorId: string) {
  const remaining = await processingFeeRemaining(tx, loan);
  if (!remaining) return;
  const [pending] = await tx
    .select({ id: mobilePayments.id })
    .from(mobilePayments)
    .where(
      and(
        eq(mobilePayments.requestId, loan.id),
        eq(mobilePayments.purpose, "loan_fee"),
        inArray(mobilePayments.status, ["created", "pending"]),
      ),
    );
  if (pending)
    throw new LoanError(
      "A previous fee payment is awaiting confirmation. Check its status before deducting from savings.",
    );
  const position = await savingsPosition(tx, loan.memberId);
  if (position.available < remaining)
    throw new LoanError(
      `The processing fee needs ${remaining.toLocaleString()} RWF of available savings. Make a contribution before requesting or processing this loan.`,
    );
  const [ownBacking] = await tx
    .select()
    .from(loanBackings)
    .where(
      and(eq(loanBackings.requestId, loan.id), eq(loanBackings.isBorrower, true), eq(loanBackings.status, "approved")),
    );
  if (
    ownBacking &&
    Math.floor(((position.total - remaining) * (loan.loanTerms?.savingsLimitBps ?? 8000)) / 10000) < position.locked
  )
    throw new LoanError(
      "After the processing fee deduction, this loan exceeds your savings borrowing limit. Add savings or request a smaller loan.",
    );
  const chargedAt = new Date();
  const source = remaining === loan.processingFeeAmount ? ("savings" as const) : ("mixed" as const);
  await tx.insert(ledgerEntries).values({
    reference: `LP-${loan.id.replaceAll("-", "")}`,
    memberId: loan.memberId,
    kind: "adjustment",
    amount: -remaining,
    period: kigaliToday(chargedAt).slice(0, 7),
    paidAt: chargedAt,
    source: "manual",
    sourceRef: `loan:${loan.id}:processing-fee`,
    recordedBy: actorId,
    method: "Savings balance",
    note: "Non-refundable loan processing fee deducted from savings",
  });
  await tx
    .update(financeRequests)
    .set({
      processingFeeDeductedAmount: loan.processingFeeDeductedAmount + remaining,
      processingFeePaidAt: chargedAt,
      processingFeeSource: source,
      ...(loan.loanTerms ? { loanTerms: { ...loan.loanTerms, processingFeeSource: source } } : {}),
    })
    .where(eq(financeRequests.id, loan.id));
  await tx.insert(auditLog).values({
    actorId,
    action: "loan.processing_fee",
    entity: "finance_request",
    entityId: loan.id,
    details: { amount: remaining, source: "savings", nonRefundable: true },
  });
  await queueLoanNotice(
    tx,
    loan.memberId,
    `loan-fee:${loan.id}`,
    "Processing fee deducted",
    "Your non-refundable loan processing fee was deducted from available savings. Your loan can now proceed to backing and manager review.",
  );
}
export async function deductRequestedLoanFee(memberId: string, actorId: string, id: string) {
  await db.transaction(async (tx) => {
    await lockFinance(tx);
    const [member] = await tx.select().from(members).where(eq(members.id, memberId)).for("update");
    if (!member || member.status !== "active") throw new LoanError("Only active members can process loans.");
    const [loan] = await tx
      .select()
      .from(financeRequests)
      .where(and(eq(financeRequests.id, id), eq(financeRequests.memberId, memberId), eq(financeRequests.kind, "loan")))
      .for("update");
    if (!loan) throw new LoanError("Loan request not found.");
    if (!(await processingFeeRemaining(tx, loan))) return;
    if (loan.status !== "requested") throw new LoanError("This request is no longer waiting to be processed.");
    await chargeLoanProcessingFee(tx, loan, actorId);
  });
}

export async function validateLoanFunding(tx: FinanceTx, request: Request) {
  if (!request.loanTerms) return; // Existing loans keep their previously accepted terms.
  if (request.processingFeeAmount > 0 && !request.processingFeePaidAt)
    throw new LoanError(
      "Deduct the non-refundable processing fee from available savings before this loan can be processed.",
    );
  const backings = await tx.select().from(loanBackings).where(eq(loanBackings.requestId, request.id));
  if (
    !backings.length ||
    backings.some((b) => b.status !== "approved") ||
    backings.reduce((n, b) => n + b.amount, 0) !== request.amount
  )
    throw new LoanError("All backing members must approve the full loan amount, including its payout fee.");
  for (const backing of backings) {
    const [owner] = await tx.select().from(members).where(eq(members.id, backing.memberId));
    if (!owner || owner.status !== "active" || (await savingsPosition(tx, backing.memberId)).available < 0)
      throw new LoanError("A backing pool no longer covers its agreed amount. Cancel and submit a new request.");
  }
}

export type NewLoan = {
  id: string;
  memberId: string;
  userId: string;
  amount: number;
  payoutAmount: number;
  quotedFee: number;
  msisdn: string;
  reason: string;
  loanType: "savings" | "backed";
  repaymentMonths: number;
  ownBackingAmount: number;
  policyVersion: string;
  backers: { code: string; amount: number }[];
};
export async function createLoanRequest(data: NewLoan) {
  return db.transaction(async (tx) => {
    await lockFinance(tx);
    const [borrower] = await tx.select().from(members).where(eq(members.id, data.memberId)).for("update");
    if (!borrower || borrower.status !== "active") throw new LoanError("Only active members can request a loan.");
    const [existing] = await tx.select().from(financeRequests).where(eq(financeRequests.id, data.id));
    if (existing) {
      if (
        existing.memberId !== data.memberId ||
        existing.kind !== "loan" ||
        existing.loanType !== data.loanType ||
        existing.amount !== data.amount ||
        existing.payoutAmount !== data.payoutAmount ||
        existing.reason !== data.reason ||
        existing.msisdn !== data.msisdn ||
        existing.repaymentMonths !== data.repaymentMonths
      )
        throw new LoanError("This reference belongs to another request.");
      const actual = await tx
        .select({ code: members.code, amount: loanBackings.amount, own: loanBackings.isBorrower })
        .from(loanBackings)
        .innerJoin(members, eq(members.id, loanBackings.memberId))
        .where(eq(loanBackings.requestId, existing.id));
      const expected = data.backers
        .map((b) => `${b.code}:${b.amount}`)
        .sort()
        .join(",");
      if (
        actual
          .filter((b) => !b.own)
          .map((b) => `${b.code}:${b.amount}`)
          .sort()
          .join(",") !== expected ||
        (actual.find((b) => b.own)?.amount ?? 0) !== (data.loanType === "savings" ? data.amount : data.ownBackingAmount)
      )
        throw new LoanError("The backing allocations changed. Refresh before submitting again.");
      return;
    }
    const policy = await getLoanPolicy(tx),
      rule = policy[data.loanType];
    if (data.policyVersion !== policy.version)
      throw new LoanError("Loan settings changed. Refresh and confirm the updated terms.");
    if (
      !rule.enabled ||
      data.amount < rule.minAmount ||
      data.amount > rule.maxAmount ||
      data.repaymentMonths < 1 ||
      data.repaymentMonths > rule.maxMonths
    )
      throw new LoanError("The requested amount or repayment period is outside the configured loan limits.");
    const [pending] = await tx
      .select()
      .from(financeRequests)
      .where(
        and(
          eq(financeRequests.memberId, data.memberId),
          eq(financeRequests.kind, "loan"),
          inArray(financeRequests.status, ["requested", "approved"]),
        ),
      );
    if (pending) throw new LoanError("You already have a loan awaiting backing, review or payout.");
    const feeAmount = Math.ceil((data.payoutAmount * policy.processingFeeBps) / 10000);
    const position = await savingsPosition(tx, data.memberId);
    if (position.available < feeAmount)
      throw new LoanError(
        `The processing fee needs ${feeAmount.toLocaleString()} RWF of available savings. Make a contribution before requesting this loan.`,
      );
    const capacityAfterFee = Math.max(
      0,
      Math.min(
        position.available - feeAmount,
        Math.floor(((position.total - feeAmount) * policy.savingsLimitBps) / 10000) - position.locked,
      ),
    );
    const ownAmount = data.loanType === "savings" ? data.amount : data.ownBackingAmount;
    if (ownAmount > capacityAfterFee)
      throw new LoanError(
        "Your own backing exceeds your savings loan limit after the processing fee and existing commitments.",
      );
    if (data.loanType === "savings" && data.backers.length)
      throw new LoanError("A savings-backed loan uses only your own savings.");
    if (
      data.loanType === "backed" &&
      (data.backers.length < policy.minBackers || data.backers.length > policy.maxBackers)
    )
      throw new LoanError(`Choose between ${policy.minBackers} and ${policy.maxBackers} backing members.`);
    if (data.loanType === "backed" && ownAmount + data.backers.reduce((n, b) => n + b.amount, 0) !== data.amount)
      throw new LoanError(
        "Own backing and member backing must exactly cover the loan principal including its payout fee.",
      );
    const distinct = new Set(data.backers.map((b) => b.code));
    if (distinct.size !== data.backers.length || distinct.has(borrower.code))
      throw new LoanError("Choose different backing members; use the own-backing field for yourself.");
    const supporters = [];
    for (const pledge of data.backers) {
      const [supporter] = await tx
        .select({ member: members, user: users })
        .from(members)
        .innerJoin(users, eq(users.memberId, members.id))
        .where(eq(members.code, pledge.code));
      if (
        !supporter ||
        supporter.member.status !== "active" ||
        supporter.user.disabledAt ||
        !supporter.user.passwordHash ||
        pledge.amount <= 0
      )
        throw new LoanError("Each backing member must be active and able to sign in.");
      supporters.push({ member: supporter.member, amount: pledge.amount });
    }
    const loanTerms = termsFor(policy, data.loanType);
    await tx.insert(financeRequests).values({
      id: data.id,
      memberId: data.memberId,
      kind: "loan",
      loanType: data.loanType,
      loanTerms,
      processingFeeAmount: feeAmount,
      processingFeeSource: "savings",
      repaymentMonths: data.repaymentMonths,
      amount: data.amount,
      payoutAmount: data.payoutAmount,
      quotedFee: data.quotedFee,
      feePolicy: "member",
      msisdn: data.msisdn,
      reason: data.reason,
    });
    if (ownAmount)
      await tx.insert(loanBackings).values({
        requestId: data.id,
        memberId: data.memberId,
        amount: ownAmount,
        isBorrower: true,
        status: "approved",
        mode: policy.backingMode,
        decidedAt: new Date(),
      });
    const [savedLoan] = await tx.select().from(financeRequests).where(eq(financeRequests.id, data.id));
    await chargeLoanProcessingFee(tx, savedLoan, data.userId);
    for (const pledge of supporters) {
      await tx
        .insert(loanBackings)
        .values({ requestId: data.id, memberId: pledge.member.id, amount: pledge.amount, mode: policy.backingMode });
      await queueLoanNotice(
        tx,
        pledge.member.id,
        `loan-backing:${data.id}`,
        "Loan backing requested",
        "A member has requested your backing. Review the amount and loan terms in Payments & loans; no funds are committed until you approve.",
      );
    }
    await tx.insert(auditLog).values({
      actorId: data.userId,
      action: "loan.request",
      entity: "finance_request",
      entityId: data.id,
      details: { type: data.loanType, principal: data.amount, terms: loanTerms },
    });
  });
}

export async function decideBacking(id: string, memberId: string, userId: string, approve: boolean) {
  await db.transaction(async (tx) => {
    await lockFinance(tx);
    const [backing] = await tx
      .select()
      .from(loanBackings)
      .where(and(eq(loanBackings.id, id), eq(loanBackings.memberId, memberId)))
      .for("update");
    if (!backing || backing.isBorrower) throw new LoanError("Backing invitation not found.");
    const [loan] = await tx
      .select()
      .from(financeRequests)
      .where(eq(financeRequests.id, backing.requestId))
      .for("update");
    if (loan.status !== "requested" || backing.status !== "pending")
      throw new LoanError("This invitation is no longer awaiting your decision.");
    const [owner] = await tx.select().from(members).where(eq(members.id, memberId)).for("update");
    if (!owner || owner.status !== "active") throw new LoanError("Only active members can approve backing.");
    if (approve && loan.processingFeeAmount > 0 && !loan.processingFeePaidAt)
      throw new LoanError(
        "The processing fee must be deducted from the borrower’s savings before backing can be approved.",
      );
    if (approve && backing.amount > (await lendingCapacity(tx, memberId, loan.loanTerms!.backerLimitBps)))
      throw new LoanError("This backing exceeds your available savings or configured backing limit.");
    await tx
      .update(loanBackings)
      .set({ status: approve ? "approved" : "declined", decidedAt: new Date() })
      .where(eq(loanBackings.id, backing.id));
    if (!approve)
      await tx
        .update(financeRequests)
        .set({
          status: "rejected",
          reviewNote: "A backing member declined. Submit a new request with a different funding plan.",
        })
        .where(eq(financeRequests.id, loan.id));
    await tx.insert(auditLog).values({
      actorId: userId,
      action: approve ? "loan.backing_approve" : "loan.backing_decline",
      entity: "loan_backing",
      entityId: id,
    });
    await queueLoanNotice(
      tx,
      loan.memberId,
      `loan-backing-decision:${id}`,
      approve ? "Loan backing approved" : "Loan backing declined",
      approve
        ? "A supporting member approved their backing. Follow your loan request in Elayo Family."
        : "A supporting member declined; your loan request has been closed and reserved backing released.",
    );
  });
}

export async function fundBackings(tx: FinanceTx, loan: Request, paidAt: Date) {
  if (!loan.loanTerms) return;
  const backings = await tx.select().from(loanBackings).where(eq(loanBackings.requestId, loan.id));
  for (const b of backings) {
    if (b.fundedAt) continue;
    if (b.mode === "deduct")
      await tx.insert(ledgerEntries).values({
        reference: `LB-${b.id}`,
        memberId: b.memberId,
        kind: "adjustment",
        amount: -b.amount,
        paidAt,
        method: "Loan pool",
        source: "manual",
        sourceRef: `loan:${loan.id}:backing:${b.id}`,
        note: "Savings lent to an approved loan",
      });
    await tx.update(loanBackings).set({ fundedAt: paidAt }).where(eq(loanBackings.id, b.id));
    await queueLoanNotice(
      tx,
      b.memberId,
      `loan-funded:${b.id}`,
      "Loan backing activated",
      b.mode === "lock"
        ? "Your approved savings backing is locked until the loan's repayment terms release it."
        : "Your approved backing has been lent from your savings pool. Repayments will restore it under the agreed terms.",
    );
  }
}
export async function releaseBackings(tx: FinanceTx, loan: Request, paidAt: Date, paymentId: string) {
  if (!loan.loanTerms) return;
  const balance = await getLoanBalance(tx, loan, paidAt);
  const backings = await tx.select().from(loanBackings).where(eq(loanBackings.requestId, loan.id));
  for (const b of backings) {
    const target =
      balance.outstanding === 0
        ? b.amount
        : loan.loanTerms.release === "full_repayment"
          ? 0
          : Math.floor((b.amount * balance.principalPaid) / loan.amount);
    const release = Math.max(0, target - b.releasedAmount);
    if (!release) continue;
    if (b.mode === "deduct")
      await tx.insert(ledgerEntries).values({
        reference: `LR-${randomUUID()}`,
        memberId: b.memberId,
        kind: "adjustment",
        amount: release,
        paidAt,
        method: "Loan repayment",
        source: "manual",
        sourceRef: `loan:${loan.id}:return:${paymentId}:${b.id}`,
        note: "Loan backing returned to savings",
      });
    await tx.update(loanBackings).set({ releasedAmount: target }).where(eq(loanBackings.id, b.id));
    await queueLoanNotice(
      tx,
      b.memberId,
      `loan-release:${paymentId}:${b.id}`,
      "Loan backing released",
      "A repayment released part or all of your savings backing. See your available savings in Elayo Family.",
    );
  }
}
