"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, financeRequests, members, mobilePayments, users } from "@/db/schema";
import { canReadGroup, canEditRecords, canApproveLoans } from "@/lib/permissions";
import { createLoanRequest, decideBacking, getLoanPolicy, lendingCapacity, savingsPosition, validateLoanFunding, deductRequestedLoanFee, queueLoanNotice, LoanError } from "@/lib/loan-service";
import { lockFinance } from "@/lib/finance-lock";
import { assertAdmin, getViewer } from "@/lib/auth/viewer";
import { availableSavings, loadFinance, loanOutstanding, lockMember, submitPayment, unresolved } from "@/lib/mobile-money";
import { normalizePhone, paymentConfig, ProviderError } from "@/lib/xendly";
import { SHARE_VALUE } from "@/lib/portal-data";
import { quoteCollection, quotePayout } from "@/lib/payment-fees";

class FinanceError extends Error {}
const rwf = z.number().int("Use a whole RWF amount.").min(1).max(100_000_000);
const contributionInput = z.object({ id: z.uuid(), kind: z.enum(["savings", "social", "loan_repayment", "loan_fee"]), amount: rwf,
  feeBps: z.number().int().min(0).max(9999), phone: z.string().max(30), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), note: z.string().trim().max(200), requestId: z.uuid().optional() });
const requestInput = z.object({ id: z.uuid(), kind: z.enum(["loan", "withdrawal"]), amount: rwf.min(10_000), feeBps: z.number().int().min(0).max(9999), phone: z.string().max(30), reason: z.string().trim().min(5, "Explain what the funds are for.").max(500), loanType: z.enum(["savings", "backed"]).optional(), repaymentMonths: z.number().int().min(1).max(120).optional(), ownBackingAmount: z.number().int().min(0).max(100000000).default(0), backers: z.array(z.object({ code: z.string().trim().min(1).max(20), amount: z.number().int().positive().max(100000000) })).max(20).default([]), policyVersion: z.string().optional() });
const reviewInput = z.object({ id: z.uuid(), approve: z.boolean(), note: z.string().trim().min(3, "Add a review note.").max(500), interestAmount: z.number().int().min(0).max(100_000_000).default(0), repaymentMonths: z.number().int().min(1).max(120).default(12) });

async function run<T>(work: () => Promise<T>, revalidate = true) {
  try {
    const value = await work();
    if (revalidate) { revalidatePath("/member", "layout"); revalidatePath("/admin", "layout"); }
    return { ok: true as const, value };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false as const, error: error.issues[0]?.message ?? "Check the form." };
    if (error instanceof FinanceError || error instanceof ProviderError || error instanceof LoanError) return { ok: false as const, error: error.message };
    console.error("Finance operation failed", error);
    return { ok: false as const, error: "Could not complete this operation. Refresh to check its status before trying again." };
  }
}
async function ownMember() {
  const viewer = await getViewer();
  if (!viewer?.member) throw new FinanceError("Sign in with an account linked to a member profile.");
  return { ...viewer, member: viewer.member };
}
function phone(value: string) { try { return normalizePhone(value); } catch (error) { throw new FinanceError((error as Error).message); } }
function configured(payout = false) {
  const config = paymentConfig();
  if (!config.configured) throw new FinanceError("Mobile money is not connected yet. Please contact your administrator.");
  if (payout && config.mode !== "live") throw new FinanceError("Cashouts require a live XendlyPay app and a verified business.");
  return config;
}

export async function getOwnFinance() {
  return run(async () => { const viewer = await ownMember(); const policy = await getLoanPolicy(); return { ...await loadFinance(viewer.member.id), config: paymentConfig(), policy, position: await savingsPosition(db, viewer.member.id), savingsLoanLimit: await lendingCapacity(db, viewer.member.id, policy.savingsLimitBps) }; }, false);
}

export async function contributeMobileMoney(input: z.input<typeof contributionInput>) {
  return run(async () => {
    const viewer = await ownMember(); const data = contributionInput.parse(input); if (data.kind === "loan_fee") throw new FinanceError("Loan processing fees are deducted from available savings, not paid by mobile money."); const config = configured(); const msisdn = phone(data.phone);
    if (data.feeBps !== config.feeBps) throw new FinanceError("The provider fee quote changed. Refresh and confirm the updated total.");
    const quote = quoteCollection(data.amount, config.feeBps);
    if (!["loan_repayment", "loan_fee"].includes(data.kind) && data.amount < 100) throw new FinanceError("The minimum contribution is 100 RWF.");
    if (data.kind === "savings" && data.amount % SHARE_VALUE) throw new FinanceError(`Savings must be whole shares of ${SHARE_VALUE.toLocaleString()} RWF.`);
    const payment = await db.transaction(async tx => {
      await lockMember(tx, viewer.member.id);
      const [existing] = await tx.select().from(mobilePayments).where(eq(mobilePayments.id, data.id));
      if (existing) {
        if (existing.memberId !== viewer.member.id || existing.direction !== "collect" || (existing.accountAmount ?? existing.amount) !== data.amount || existing.purpose !== data.kind || existing.msisdn !== msisdn || existing.period !== data.period || existing.requestId !== (data.requestId ?? null) || existing.mode !== config.mode) throw new FinanceError("This reference belongs to a different payment. Refresh to start again.");
        return existing;
      }
      const [pending] = await tx.select().from(mobilePayments).where(and(eq(mobilePayments.memberId, viewer.member.id), eq(mobilePayments.direction, "collect"), inArray(mobilePayments.status, [...unresolved]))).limit(1);
      if (pending) throw new FinanceError("You already have a payment waiting. Check its status before sending another prompt.");
      if (data.kind === "loan_repayment") {
        if (config.mode !== "live") throw new FinanceError("Loan repayments require live mode.");
        const [loan] = await tx.select().from(financeRequests).where(eq(financeRequests.id, data.requestId ?? randomUUID())).for("update");
        if (!loan || loan.memberId !== viewer.member.id || loan.kind !== "loan" || loan.status !== "paid") throw new FinanceError("Choose one of your disbursed loans.");
        if (data.amount > await loanOutstanding(tx, loan, true)) throw new FinanceError("The repayment exceeds the outstanding loan balance.");
      } else if (data.requestId) throw new FinanceError("Only loan payments can be linked to a loan.");
      const [row] = await tx.insert(mobilePayments).values({ id: data.id, memberId: viewer.member.id, createdBy: viewer.id, purpose: data.kind, direction: "collect", amount: quote.walletAmount, accountAmount: data.amount, quotedFee: quote.fee, feePolicy: "member", msisdn, period: data.period, description: `${viewer.member.code} · ${data.kind} · ${data.period}${data.note ? ` · ${data.note}` : ""}`, mode: config.mode, requestId: data.requestId }).returning();
      return row;
    });
    await submitPayment(payment); return { id: payment.id };
  });
}

export async function deductLoanProcessingFee(id: string) {
  return run(async () => {
    const viewer = await ownMember(); z.uuid().parse(id);
    await deductRequestedLoanFee(viewer.member.id, viewer.id, id);
  });
}

export async function requestFunds(input: z.input<typeof requestInput>) {
  return run(async () => {
    const viewer = await ownMember(); const data = requestInput.parse(input); const msisdn = phone(data.phone);
    const config = paymentConfig();
    if (data.feeBps !== config.feeBps) throw new FinanceError("The provider fee quote changed. Refresh and confirm the updated total.");
    const quote = quotePayout(data.amount, config.feeBps);
    if (data.kind === "loan") {
      if (!data.loanType || !data.repaymentMonths || !data.policyVersion) throw new FinanceError("Choose your loan type and repayment period, and confirm the current terms.");
      await createLoanRequest({ id: data.id, memberId: viewer.member.id, userId: viewer.id, amount: quote.accountAmount, payoutAmount: data.amount, quotedFee: quote.fee, msisdn, reason: data.reason, loanType: data.loanType, repaymentMonths: data.repaymentMonths, ownBackingAmount: data.ownBackingAmount, backers: data.backers, policyVersion: data.policyVersion });
      return { id: data.id };
    }
    await db.transaction(async tx => {
      await lockMember(tx, viewer.member.id);
      const [existing] = await tx.select().from(financeRequests).where(eq(financeRequests.id, data.id));
      if (existing) {
        if (existing.memberId !== viewer.member.id || existing.kind !== data.kind || (existing.payoutAmount ?? existing.amount) !== data.amount || existing.msisdn !== msisdn || existing.reason !== data.reason) throw new FinanceError("This reference belongs to another request.");
        return;
      }
      if (data.kind === "withdrawal" && quote.accountAmount > await availableSavings(tx, viewer.member.id)) throw new FinanceError("The withdrawal plus provider fee exceeds your available savings after existing requests.");
      const [pending] = await tx.select().from(financeRequests).where(and(eq(financeRequests.memberId, viewer.member.id), eq(financeRequests.kind, data.kind), inArray(financeRequests.status, ["requested", "approved"])));
      if (pending) throw new FinanceError("You already have a request awaiting review or payout.");
      await tx.insert(financeRequests).values({ id: data.id, memberId: viewer.member.id, kind: data.kind, amount: quote.accountAmount, payoutAmount: data.amount, quotedFee: quote.fee, feePolicy: "member", msisdn, reason: data.reason });
      await tx.insert(auditLog).values({ actorId: viewer.id, action: "finance.request", entity: "finance_request", entityId: data.id, details: { kind: data.kind, amount: data.amount } });
    });
    return { id: data.id };
  });
}

export async function reviewFunds(input: z.input<typeof reviewInput>) {
  return run(async () => {
    const admin = await getViewer(); const data = reviewInput.parse(input);
    if (!admin) throw new FinanceError("Sign in to review a request.");
    await db.transaction(async tx => {
      const [original] = await tx.select().from(financeRequests).where(eq(financeRequests.id, data.id));
      if (!original) throw new FinanceError("Request not found.");
      await lockMember(tx, original.memberId);
      const [request] = await tx.select().from(financeRequests).where(eq(financeRequests.id, data.id)).for("update");
      if (request.status !== "requested") throw new FinanceError("This request has already been reviewed.");
      if (request.kind === "loan" ? !canApproveLoans(admin.role) : !canEditRecords(admin.role)) throw new FinanceError(request.kind === "loan" ? "Only a manager can approve or decline loans." : "Only the secretary or superadmin can review withdrawals.");
      if (request.kind === "loan" && data.approve) {
        if (admin.member?.id === request.memberId && !request.loanTerms?.allowSelfApproval) throw new FinanceError("Another manager must review your own loan.");
        await validateLoanFunding(tx, request);
      }
      await tx.update(financeRequests).set({ status: data.approve ? "approved" : "rejected", reviewNote: data.note, reviewedBy: admin.id, reviewedAt: new Date(), interestAmount: request.loanTerms ? null : request.kind === "loan" && data.approve ? data.interestAmount : null, repaymentMonths: request.loanTerms ? request.repaymentMonths : request.kind === "loan" && data.approve ? data.repaymentMonths : null }).where(eq(financeRequests.id, data.id));
      await tx.insert(auditLog).values({ actorId: admin.id, action: data.approve ? "finance.approve" : "finance.reject", entity: "finance_request", entityId: data.id, details: data });
      if (request.kind === "loan") await queueLoanNotice(tx, request.memberId, `loan-reviewed:${request.id}`, data.approve ? "Loan approved by manager" : "Loan request declined", data.approve ? "Your manager approved the loan. Review and accept the terms before disbursement." : "Open Elayo Family to read the manager’s decision.");
    });
  });
}

export async function acceptLoanTerms(id: string) {
  return run(async () => {
    const viewer = await ownMember(); z.uuid().parse(id);
    await db.transaction(async tx => {
      await lockFinance(tx);
      const [loan] = await tx.select().from(financeRequests).where(and(eq(financeRequests.id, id), eq(financeRequests.memberId, viewer.member.id), eq(financeRequests.kind, "loan"), eq(financeRequests.status, "approved"))).for("update");
      if (!loan) throw new FinanceError("Approved loan not found.");
      if (loan.termsAcceptedAt) return;
      await tx.update(financeRequests).set({ termsAcceptedAt: new Date() }).where(eq(financeRequests.id, id));
      await tx.insert(auditLog).values({ actorId: viewer.id, action: "loan.accept_terms", entity: "finance_request", entityId: id });
    });
  });
}

export async function cancelFundsRequest(id: string) {
  return run(async () => {
    z.uuid().parse(id); const viewer = await getViewer();
    if (!viewer) throw new FinanceError("Sign in to cancel a request.");
    await db.transaction(async tx => {
      await lockFinance(tx);
      const [original] = await tx.select().from(financeRequests).where(eq(financeRequests.id, id));
      if (!original || (!canEditRecords(viewer.role) && viewer.member?.id !== original.memberId)) throw new FinanceError("Request not found.");
      await tx.select({ id: members.id }).from(members).where(eq(members.id, original.memberId)).for("update");
      const [request] = await tx.select().from(financeRequests).where(eq(financeRequests.id, id)).for("update");
      if (!["requested", "approved"].includes(request.status)) throw new FinanceError("This request can no longer be cancelled.");
      const [payment] = await tx.select().from(mobilePayments).where(and(eq(mobilePayments.requestId, id), eq(mobilePayments.direction, "payout"), inArray(mobilePayments.status, ["created", "pending", "succeeded"])));
      if (payment) throw new FinanceError("A payout is already in progress or completed. Check its status before cancelling.");
      await tx.update(financeRequests).set({ status: "cancelled" }).where(eq(financeRequests.id, id));
      await tx.insert(auditLog).values({ actorId: viewer.id, action: "finance.cancel", entity: "finance_request", entityId: id });
    });
  });
}

export async function payApprovedRequest(id: string) {
  return run(async () => {
    const admin = await assertAdmin(); z.uuid().parse(id); const config = configured(true);
    const payment = await db.transaction(async tx => {
      const [original] = await tx.select().from(financeRequests).where(eq(financeRequests.id, id));
      if (!original) throw new FinanceError("Request not found.");
      await lockMember(tx, original.memberId);
      const [request] = await tx.select().from(financeRequests).where(eq(financeRequests.id, id)).for("update");
      if (request.status !== "approved") throw new FinanceError("Only approved requests can be paid.");
      if (request.kind === "loan" && !request.termsAcceptedAt) throw new FinanceError("The member must accept the loan terms before payout.");
      if (request.kind === "loan") await validateLoanFunding(tx, request);
      if (request.kind === "withdrawal" && await availableSavings(tx, request.memberId) < 0) throw new FinanceError("Savings have changed. Resolve the member's reserved withdrawals before payout.");
      const [existing] = await tx.select().from(mobilePayments).where(and(eq(mobilePayments.requestId, id), eq(mobilePayments.direction, "payout"), inArray(mobilePayments.status, ["created", "pending", "succeeded"])));
      if (existing) return existing;
      if (request.feePolicy === "member" && quotePayout(request.payoutAmount!, config.feeBps).fee !== request.quotedFee) throw new FinanceError("The provider fee has changed since this request. Cancel it and have the member confirm a new quote.");
      const [row] = await tx.insert(mobilePayments).values({ id: randomUUID(), memberId: request.memberId, requestId: id, purpose: request.kind, direction: "payout", amount: request.payoutAmount ?? request.amount, accountAmount: request.amount, quotedFee: request.quotedFee, feePolicy: request.feePolicy, msisdn: request.msisdn, description: `${request.kind} · ${id}`, mode: "live", createdBy: admin.id }).returning();
      await tx.insert(auditLog).values({ actorId: admin.id, action: "finance.payout", entity: "finance_request", entityId: id, details: { paymentId: row.id, amount: row.amount, msisdn: row.msisdn } });
      return row;
    });
    await submitPayment(payment); return { id: payment.id };
  });
}

export async function checkMobilePayment(id: string) {
  return run(async () => {
    z.uuid().parse(id); const viewer = await getViewer();
    const [payment] = await db.select().from(mobilePayments).where(eq(mobilePayments.id, id));
    if (!viewer || !payment || (!canReadGroup(viewer.role) && viewer.member?.id !== payment.memberId)) throw new FinanceError("Payment not found.");
    if (!payment.providerId && !canEditRecords(viewer.role) && (payment.direction === "payout" || viewer.member?.id !== payment.memberId)) throw new FinanceError("Your administrator must check this payout.");
    if (payment.mode !== configured().mode) throw new FinanceError("This payment belongs to a different provider mode. Ask your administrator to reconcile it with its original app key.");
    await submitPayment(payment);
  });
}

export async function replyToLoanBacking(id: string, approve: boolean) {
  return run(async () => { const viewer = await ownMember(); z.uuid().parse(id); z.boolean().parse(approve); await decideBacking(id, viewer.member.id, viewer.id, approve); });
}
export async function searchLoanBackers(query: string) {
  const viewer = await ownMember(); const q = z.string().trim().max(80).parse(query);
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return db.select({ code: members.code, name: sql<string>`concat_ws(' ', ${members.firstName}, ${members.surname})` }).from(members)
    .innerJoin(users, eq(users.memberId, members.id)).where(and(eq(members.status, "active"), isNull(users.disabledAt), sql`${users.passwordHash} is not null`, sql`${members.id} <> ${viewer.member.id}`, sql`(${members.code} ilike ${pattern} or concat_ws(' ', ${members.firstName}, ${members.surname}) ilike ${pattern})`)).limit(20);
}
