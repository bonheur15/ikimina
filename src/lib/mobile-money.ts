import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  cashbookEntries,
  financeRequests,
  ledgerEntries,
  loanBackings,
  members,
  mobilePayments,
  paymentDeliveries,
} from "@/db/schema";
import { kigaliToday } from "@/lib/portal-data";
import { normalizePhone, providerTransaction, ProviderError, xendlyRequest, type ProviderTransaction } from "./xendly";
import { loadContributionProofs } from "./contribution-proofs";
import { lockFinance } from "./finance-lock";
import {
  fundBackings,
  getLoanBalance,
  releaseBackings,
  savingsPosition,
  queueLoanNotice,
  processingFeeRemaining,
} from "./loan-service";

export type PaymentRow = typeof mobilePayments.$inferSelect;
export type RequestRow = typeof financeRequests.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const unresolved = ["created", "pending"] as const;

export async function lockMember(tx: Tx, memberId: string) {
  await lockFinance(tx);
  const [member] = await tx.select().from(members).where(eq(members.id, memberId)).for("update");
  if (!member || member.status !== "active") throw new Error("Only active members can make payments or request funds.");
  return member;
}

export async function availableSavings(tx: Pick<Tx, "select">, memberId: string) {
  return (await savingsPosition(tx, memberId)).available;
}

export async function loanOutstanding(tx: Pick<Tx, "select">, request: RequestRow, includePending = false) {
  if (request.loanTerms) {
    const balance = await getLoanBalance(tx, request);
    if (!includePending) return balance.outstanding;
    const [reserved] = await tx
      .select({
        amount:
          sql<number>`coalesce(sum(coalesce(${mobilePayments.accountAmount}, ${mobilePayments.amount})), 0)`.mapWith(
            Number,
          ),
      })
      .from(mobilePayments)
      .where(
        and(
          eq(mobilePayments.requestId, request.id),
          eq(mobilePayments.purpose, "loan_repayment"),
          inArray(mobilePayments.status, ["created", "pending"]),
        ),
      );
    return Math.max(0, balance.outstanding - reserved.amount);
  }
  const [paid] = await tx
    .select({
      amount:
        sql<number>`coalesce(sum(case when ${mobilePayments.status} = 'succeeded' then coalesce(${mobilePayments.appliedAmount}, case when ${mobilePayments.feePolicy} = 'member' then ${mobilePayments.amount} - ${mobilePayments.fee} else ${mobilePayments.amount} end) else coalesce(${mobilePayments.accountAmount}, ${mobilePayments.amount}) end), 0)`.mapWith(
          Number,
        ),
    })
    .from(mobilePayments)
    .where(
      and(
        eq(mobilePayments.requestId, request.id),
        eq(mobilePayments.purpose, "loan_repayment"),
        eq(mobilePayments.mode, "live"),
        inArray(mobilePayments.status, includePending ? ["succeeded", "created", "pending"] : ["succeeded"]),
      ),
    );
  return request.amount + (request.interestAmount ?? 0) - paid.amount;
}

/** A transaction and all accounting effects commit together. Row locks make replay/concurrent reconciliation safe. */
export async function settlePayment(payment: ProviderTransaction, deliveryId?: string) {
  await db.transaction(async (tx) => {
    await lockFinance(tx);
    if (deliveryId) {
      const inserted = await tx.insert(paymentDeliveries).values({ id: deliveryId }).onConflictDoNothing().returning();
      if (!inserted.length) return;
    }
    const [original] = await tx.select().from(mobilePayments).where(eq(mobilePayments.id, payment.reference));
    if (!original) throw new Error("Payment reference is unknown.");
    // All finance mutations lock the member first, then the payment/request, to avoid deadlocks.
    await tx.select({ id: members.id }).from(members).where(eq(members.id, original.memberId)).for("update");
    const [local] = await tx.select().from(mobilePayments).where(eq(mobilePayments.id, original.id)).for("update");
    if (
      local.amount !== payment.amount ||
      local.msisdn !== normalizePhone(payment.msisdn) ||
      local.direction !== payment.direction ||
      local.mode !== payment.mode ||
      (local.providerId && local.providerId !== payment.id)
    ) {
      throw new Error("Provider payment does not match the saved transaction.");
    }
    if (local.direction === "collect" && payment.fee >= payment.amount) throw new Error("Collection fee is invalid.");
    if (!unresolved.includes(local.status as "created" | "pending")) {
      if (payment.status !== "pending" && local.status !== payment.status)
        throw new Error("Conflicting final payment status.");
      return;
    }
    const completedAt =
      payment.status === "pending" ? null : payment.completed_at ? new Date(payment.completed_at) : new Date();
    let accounted =
      local.feePolicy === "member"
        ? local.direction === "collect"
          ? local.amount - payment.fee
          : local.amount + payment.fee
        : local.amount;
    let repaymentSurplus = 0;
    if (
      payment.status === "succeeded" &&
      local.mode === "live" &&
      ["loan_repayment", "loan_fee"].includes(local.purpose) &&
      local.requestId
    ) {
      const [loan] = await tx
        .select()
        .from(financeRequests)
        .where(eq(financeRequests.id, local.requestId))
        .for("update");
      const debt =
        local.purpose === "loan_fee"
          ? await processingFeeRemaining(tx, loan)
          : Math.max(
              0,
              loan.loanTerms
                ? (await getLoanBalance(tx, loan, completedAt!)).outstanding
                : await loanOutstanding(tx, loan),
            );
      repaymentSurplus = Math.max(0, accounted - debt);
      accounted -= repaymentSurplus;
    }
    await tx
      .update(mobilePayments)
      .set({
        providerId: payment.id,
        status: payment.status,
        fee: payment.fee,
        appliedAmount: payment.status === "succeeded" ? accounted : null,
        completedAt,
        failureMessage: payment.failure_message ?? null,
      })
      .where(eq(mobilePayments.id, local.id));
    if (payment.status !== "succeeded") return;
    // Test collections still move money, but belong to separate books, never the member's live savings.
    if (local.mode === "live") {
      if (["savings", "social", "penalty", "withdrawal"].includes(local.purpose)) {
        await tx.insert(ledgerEntries).values({
          reference: `MM-${local.id}`,
          memberId: local.memberId,
          kind: local.purpose === "withdrawal" ? "adjustment" : (local.purpose as "savings" | "social" | "penalty"),
          amount:
            local.direction === "payout"
              ? -accounted
              : local.purpose === "savings"
                ? (local.accountAmount ?? accounted)
                : accounted,
          period: local.period ?? kigaliToday(completedAt!).slice(0, 7),
          paidAt: completedAt,
          method: "Mobile Money",
          source: "manual",
          sourceRef: `xendly:${payment.id}`,
          note: local.description,
          recordedBy: local.createdBy,
        });
        if (local.purpose === "savings" && local.accountAmount !== null && accounted !== local.accountAmount) {
          await tx.insert(ledgerEntries).values({
            reference: `MF-${local.id}`,
            memberId: local.memberId,
            kind: "adjustment",
            amount: accounted - local.accountAmount,
            period: local.period,
            paidAt: completedAt,
            method: "Mobile Money",
            source: "manual",
            sourceRef: `xendly-fee-difference:${payment.id}`,
            note: "Difference between quoted and confirmed provider fee",
            recordedBy: local.createdBy,
          });
        }
      }
      if (repaymentSurplus)
        await tx.insert(ledgerEntries).values({
          reference: `MS-${local.id}`,
          memberId: local.memberId,
          kind: "adjustment",
          amount: repaymentSurplus,
          period: local.period,
          paidAt: completedAt,
          method: "Mobile Money",
          source: "manual",
          sourceRef: `xendly-repayment-surplus:${payment.id}`,
          note: "Loan payment surplus returned to savings",
          recordedBy: local.createdBy,
        });
      // Serialize book positioning with other mobile-money events.
      await tx.execute(sql`select pg_advisory_xact_lock(831729)`);
      const [{ last }] = await tx
        .select({ last: sql<number>`coalesce(max(${cashbookEntries.position}), 0)`.mapWith(Number) })
        .from(cashbookEntries);
      await tx.insert(cashbookEntries).values({
        position: last + 1,
        entryDate: kigaliToday(completedAt!),
        dateText: kigaliToday(completedAt!),
        description: local.description,
        moneyIn: local.direction === "collect" ? local.amount : 0,
        moneyOut: local.direction === "payout" ? local.amount : 0,
        category: local.purpose === "loan_fee" ? "Loan processing fee" : "Mobile money",
        source: "manual",
        sourceRef: `xendly:${payment.id}`,
        recordedBy: local.createdBy,
      });
      if (payment.fee)
        await tx.insert(cashbookEntries).values({
          position: last + 2,
          entryDate: kigaliToday(completedAt!),
          dateText: kigaliToday(completedAt!),
          description: `Mobile money fee · ${local.id}`,
          moneyOut: payment.fee,
          category: "Payment fees",
          source: "manual",
          sourceRef: `xendly-fee:${payment.id}`,
          recordedBy: local.createdBy,
        });
      if (local.direction === "payout" && local.requestId) {
        const [request] = await tx
          .select()
          .from(financeRequests)
          .where(eq(financeRequests.id, local.requestId))
          .for("update");
        await tx
          .update(financeRequests)
          .set({
            status: "paid",
            paidAt: completedAt,
            ...(local.feePolicy === "member" && !request.loanTerms ? { amount: accounted } : {}),
          })
          .where(eq(financeRequests.id, local.requestId));
        if (request.kind === "loan") {
          await fundBackings(tx, request, completedAt!);
          if (request.loanTerms && local.feePolicy === "member" && accounted !== request.amount)
            await tx.insert(ledgerEntries).values({
              reference: `LF-${local.id}`,
              memberId: request.memberId,
              kind: "adjustment",
              amount: request.amount - accounted,
              paidAt: completedAt,
              source: "manual",
              sourceRef: `loan:${request.id}:fee-difference`,
              note: "Confirmed payout fee differs from the loan quote",
              recordedBy: local.createdBy,
            });
          await queueLoanNotice(
            tx,
            request.memberId,
            `loan-paid:${request.id}`,
            "Loan disbursed",
            "Your approved loan has reached its receiving wallet. View your repayment balance and due date in Elayo Family.",
          );
        }
      }
      if (local.purpose === "loan_fee" && local.requestId) {
        const [loan] = await tx
          .select()
          .from(financeRequests)
          .where(eq(financeRequests.id, local.requestId))
          .for("update");
        if (!(await processingFeeRemaining(tx, loan)) && !loan.processingFeePaidAt) {
          await tx
            .update(financeRequests)
            .set({ processingFeePaidAt: completedAt })
            .where(eq(financeRequests.id, loan.id));
          await queueLoanNotice(
            tx,
            loan.memberId,
            `loan-fee:${loan.id}`,
            "Loan processing fee paid",
            "Your non-refundable processing fee is confirmed. Your loan can now proceed to backing and manager review.",
          );
        }
      }
      if (local.purpose === "loan_repayment" && local.requestId) {
        const [loan] = await tx.select().from(financeRequests).where(eq(financeRequests.id, local.requestId));
        await releaseBackings(tx, loan, completedAt!, local.id);
        await queueLoanNotice(
          tx,
          local.memberId,
          `loan-repaid:${local.id}`,
          "Loan repayment confirmed",
          "Your loan repayment has been recorded. View your remaining principal and interest in Elayo Family.",
        );
      }
    }
    await tx.insert(auditLog).values({
      actorId: local.createdBy,
      action: "mobile_money.succeeded",
      entity: "mobile_payment",
      entityId: local.id,
      details: { amount: local.amount, fee: payment.fee, mode: local.mode, providerId: payment.id },
    });
  });
}

export async function submitPayment(local: PaymentRow) {
  if (!unresolved.includes(local.status as "created" | "pending")) return;
  try {
    let result = local.providerId
      ? await xendlyRequest(`/v1/payments/${local.providerId}`)
      : await xendlyRequest(
          local.direction === "collect" ? "/v1/payments" : "/v1/payouts",
          {
            amount: local.amount,
            currency: "RWF",
            msisdn: local.msisdn,
            description: local.description,
            reference: local.id,
            metadata: { member_id: local.memberId, purpose: local.purpose, request_id: local.requestId },
          },
          local.id,
        );
    // The documented create response can omit mode; GET returns the full authoritative object.
    // Bind its identity now so an interrupted GET can be safely reconciled later.
    if (result && typeof result === "object" && !("mode" in result)) {
      const snapshot = providerTransaction.omit({ mode: true }).parse(result);
      if (
        snapshot.reference !== local.id ||
        snapshot.amount !== local.amount ||
        snapshot.direction !== local.direction ||
        snapshot.msisdn !== local.msisdn
      )
        throw new Error("Provider response does not match the saved payment.");
      await db
        .update(mobilePayments)
        .set({ providerId: snapshot.id, status: "pending" })
        .where(
          and(eq(mobilePayments.id, local.id), eq(mobilePayments.status, "created"), isNull(mobilePayments.providerId)),
        );
      result = await xendlyRequest(`/v1/payments/${snapshot.id}`);
    }
    await settlePayment(providerTransaction.parse(result));
  } catch (error) {
    if (error instanceof ProviderError && error.definitive && !local.providerId) {
      // A signed webhook may have already settled this row; never overwrite it.
      await db
        .update(mobilePayments)
        .set({ status: "failed", failureMessage: error.message, completedAt: new Date() })
        .where(
          and(eq(mobilePayments.id, local.id), eq(mobilePayments.status, "created"), isNull(mobilePayments.providerId)),
        );
    }
    throw error;
  }
}

export async function loadFinance(memberId?: string) {
  const [payments, requests] = await Promise.all([
    db
      .select()
      .from(mobilePayments)
      .where(memberId ? eq(mobilePayments.memberId, memberId) : undefined)
      .orderBy(
        sql`case when ${mobilePayments.status} in ('created', 'pending') then 0 else 1 end`,
        desc(mobilePayments.createdAt),
      )
      .limit(100),
    db
      .select({ request: financeRequests, memberName: members.surname, memberCode: members.code })
      .from(financeRequests)
      .innerJoin(members, eq(members.id, financeRequests.memberId))
      .where(memberId ? eq(financeRequests.memberId, memberId) : undefined)
      .orderBy(
        sql`case when ${financeRequests.status} = 'requested' then 0 when ${financeRequests.status} = 'approved' then 1 else 2 end`,
        desc(financeRequests.createdAt),
      )
      .limit(100),
  ]);
  const backings = await db
    .select({
      backing: loanBackings,
      loan: financeRequests,
      memberCode: members.code,
      memberName: sql<string>`concat_ws(' ', ${members.firstName}, ${members.surname})`,
    })
    .from(loanBackings)
    .innerJoin(financeRequests, eq(financeRequests.id, loanBackings.requestId))
    .innerJoin(members, eq(members.id, loanBackings.memberId))
    .where(
      memberId ? sql`${loanBackings.memberId} = ${memberId} or ${financeRequests.memberId} = ${memberId}` : undefined,
    );
  const invitations = memberId
    ? await db
        .select({
          backing: loanBackings,
          loan: financeRequests,
          borrowerName: sql<string>`concat_ws(' ', ${members.firstName}, ${members.surname})`,
          borrowerCode: members.code,
        })
        .from(loanBackings)
        .innerJoin(financeRequests, eq(financeRequests.id, loanBackings.requestId))
        .innerJoin(members, eq(members.id, financeRequests.memberId))
        .where(
          and(
            eq(loanBackings.memberId, memberId),
            eq(loanBackings.isBorrower, false),
            inArray(financeRequests.status, ["requested", "approved", "paid"]),
          ),
        )
    : [];
  const balances = await Promise.all(
    requests.map(async ({ request, ...member }) => {
      const balance = request.kind === "loan" && request.status === "paid" ? await getLoanBalance(db, request) : null;
      const pledges = backings.filter((b) => b.backing.requestId === request.id).map((b) => b.backing);
      const fundingReady =
        !request.loanTerms ||
        ((!request.processingFeeAmount || !!request.processingFeePaidAt) &&
          !!pledges.length &&
          pledges.every((b) => b.status === "approved") &&
          pledges.reduce((sum, b) => sum + b.amount, 0) === request.amount);
      return {
        ...request,
        ...member,
        fundingReady,
        processingFeeRemaining: await processingFeeRemaining(db, request),
        outstanding: balance?.outstanding ?? null,
        principalRemaining: balance?.principalRemaining ?? null,
        interestRemaining: balance?.interestRemaining ?? null,
        dueAt: balance?.dueAt?.toISOString() ?? null,
        overdueDays: balance?.overdueDays ?? 0,
      };
    }),
  );
  return {
    proofs: await loadContributionProofs(memberId),
    payments: payments.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
    })),
    requests: balances.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      paidAt: r.paidAt?.toISOString() ?? null,
      processingFeePaidAt: r.processingFeePaidAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      termsAcceptedAt: r.termsAcceptedAt?.toISOString() ?? null,
    })),
    backings: backings.map(({ backing: b, memberName, memberCode }) => ({
      id: b.id,
      requestId: b.requestId,
      memberName,
      memberCode,
      amount: b.amount,
      releasedAmount: b.releasedAmount,
      status: b.status,
      mode: b.mode,
      isBorrower: b.isBorrower,
    })),
    invitations: invitations.map(({ backing: b, loan, borrowerName, borrowerCode }) => ({
      id: b.id,
      requestId: loan.id,
      borrowerName,
      borrowerCode,
      amount: b.amount,
      releasedAmount: b.releasedAmount,
      status: b.status,
      loanStatus: loan.status,
      loanPrincipal: loan.amount,
      processingFeeReady: !loan.processingFeeAmount || !!loan.processingFeePaidAt,
      terms: loan.loanTerms,
      repaymentMonths: loan.repaymentMonths,
      mode: b.mode,
    })),
  };
}
export type FinanceData = Awaited<ReturnType<typeof loadFinance>>;
