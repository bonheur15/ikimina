import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DEFAULT_LOAN_POLICY, termsFor, calculateLoan } from "../src/lib/loan-policy";
import type { NewLoan } from "../src/lib/loan-service";
import { quoteCollection, quotePayout } from "../src/lib/payment-fees";

test("loan backing, repayment and OneSignal integration", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /^\/elayo_mobile_money_test_/);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.AUTH_SECRET = "fixture-auth-secret";
  const { eq, and } = await import("drizzle-orm");
  const { db, sql: client } = await import("../src/db/index");
  const schema = await import("../src/db/schema");
  const { members, users, ledgerEntries, financeRequests, mobilePayments, loanBackings, settings, pushNotifications } =
    schema;
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const service = await import("../src/lib/loan-service");
  const { settlePayment } = await import("../src/lib/mobile-money");
  const { encryptPushKey, decryptPushKey, getPushConfig } = await import("../src/lib/notification-settings");
  const { runLoanReminders } = await import("../src/lib/loan-notifications");
  const { flushPushNotifications, pushIdentity } = await import("../src/lib/onesignal");
  const originalFetch = globalThis.fetch;
  const member = async (code: string, saved = 100000) => {
    const [m] = await db.insert(members).values({ code, surname: code }).returning();
    const [u] = await db
      .insert(users)
      .values({ memberId: m.id, name: code, role: "member", passwordHash: "fixture-account-hash" })
      .returning();
    if (saved)
      await db
        .insert(ledgerEntries)
        .values({ reference: `TS-${randomUUID()}`, memberId: m.id, kind: "savings", amount: saved, source: "manual" });
    return { ...m, userId: u.id };
  };
  const makeRequest = async (
    borrower: Awaited<ReturnType<typeof member>>,
    amount: number,
    extra: Partial<NewLoan> = {},
  ) => {
    const quote = quotePayout(amount);
    const data = {
      id: randomUUID(),
      memberId: borrower.id,
      userId: borrower.userId,
      amount: quote.accountAmount,
      payoutAmount: amount,
      quotedFee: quote.fee,
      msisdn: "250788924941",
      reason: "Loan integration fixture",
      loanType: "savings" as const,
      repaymentMonths: 12,
      ownBackingAmount: 0,
      backers: [],
      policyVersion: DEFAULT_LOAN_POLICY.version,
      ...extra,
    };
    await service.createLoanRequest(data);
    return data;
  };
  const row = async (id: string) => (await db.select().from(financeRequests).where(eq(financeRequests.id, id)))[0];
  const payment = async (
    loan: typeof financeRequests.$inferSelect,
    purpose: "loan" | "loan_repayment" | "loan_fee",
    credit: number,
    at: Date,
  ) => {
    const quote =
      purpose !== "loan" ? quoteCollection(credit) : { walletAmount: loan.payoutAmount!, fee: loan.quotedFee };
    const [local] = await db
      .insert(mobilePayments)
      .values({
        id: randomUUID(),
        memberId: loan.memberId,
        requestId: loan.id,
        purpose,
        direction: purpose === "loan" ? "payout" : "collect",
        amount: quote.walletAmount,
        accountAmount: purpose === "loan" ? loan.amount : credit,
        quotedFee: quote.fee,
        feePolicy: "member",
        msisdn: loan.msisdn,
        description: "Loan fixture",
        mode: "live",
        createdBy: (await db.select().from(users).where(eq(users.memberId, loan.memberId)))[0].id,
      })
      .returning();
    return {
      id: randomUUID(),
      reference: local.id,
      direction: local.direction,
      amount: local.amount,
      fee: quote.fee,
      currency: "RWF" as const,
      mode: "live" as const,
      msisdn: local.msisdn,
      status: "succeeded" as const,
      completed_at: at.toISOString(),
    };
  };
  try {
    await t.test(
      "processing fees debit savings once and remain non-refundable without new cashbook income",
      async () => {
        const owner = await member("LOAN-FEE");
        const created = await makeRequest(owner, 20000),
          loan = await row(created.id);
        assert.equal(loan.processingFeeAmount, 200);
        assert.equal(loan.amount, 20500);
        assert.equal(loan.processingFeeSource, "savings");
        assert.equal(loan.processingFeeDeductedAmount, 200);
        assert.ok(loan.processingFeePaidAt);
        assert.equal((await service.savingsPosition(db, owner.id)).total, 99800);
        await service.createLoanRequest(created);
        await Promise.all([
          service.deductRequestedLoanFee(owner.id, owner.userId, created.id),
          service.deductRequestedLoanFee(owner.id, owner.userId, created.id),
        ]);
        assert.equal(await service.processingFeeRemaining(db, await row(created.id)), 0);
        await db.transaction(async (tx) => service.validateLoanFunding(tx, await row(created.id)));
        await db.update(financeRequests).set({ status: "cancelled" }).where(eq(financeRequests.id, loan.id));
        assert.equal((await service.savingsPosition(db, owner.id)).total, 99800);
        assert.equal((await db.select().from(mobilePayments).where(eq(mobilePayments.requestId, loan.id))).length, 0);
        const fees = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.memberId, owner.id))).filter(
          (entry) => entry.reference.startsWith("LP-"),
        );
        assert.equal(fees.length, 1);
        assert.equal(fees[0].amount, -200);
        const { cashbookEntries } = schema;
        assert.equal((await db.select().from(cashbookEntries)).length, 0);
      },
    );
    await t.test("fees require available savings and borrowing caps use the balance after the fee", async () => {
      const owner = await member("LOAN-FEE-LIMIT");
      await assert.rejects(makeRequest(owner, 77500), /processing fee/);
      assert.equal((await service.savingsPosition(db, owner.id)).total, 100000);
      const empty = await member("LOAN-FEE-EMPTY", 0),
        supporter = await member("LOAN-FEE-SUPPORTER");
      await assert.rejects(
        makeRequest(empty, 20000, { loanType: "backed", backers: [{ code: supporter.code, amount: 20500 }] }),
        /available savings/,
      );
      assert.equal((await service.savingsPosition(db, empty.id)).total, 0);
    });
    await t.test("older unpaid fee requests can use savings, without duplicating partial mobile payments", async () => {
      const owner = await member("LOAN-LEGACY-FEE");
      const [loan] = await db
        .insert(financeRequests)
        .values({
          memberId: owner.id,
          kind: "loan",
          loanType: "savings",
          loanTerms: { ...termsFor(DEFAULT_LOAN_POLICY, "savings"), processingFeeSource: "mobile_money" },
          amount: 20500,
          payoutAmount: 20000,
          quotedFee: 500,
          feePolicy: "member",
          msisdn: "250788924941",
          reason: "Historical processing-fee fixture",
          repaymentMonths: 12,
          processingFeeAmount: 200,
        })
        .returning();
      await db.insert(loanBackings).values({
        requestId: loan.id,
        memberId: owner.id,
        amount: 20500,
        status: "approved",
        isBorrower: true,
        mode: "lock",
      });
      const event = await payment(loan, "loan_fee", 200, new Date());
      await assert.rejects(service.deductRequestedLoanFee(owner.id, owner.userId, loan.id), /awaiting confirmation/);
      await settlePayment({ ...event, fee: event.fee + 10 });
      assert.equal(await service.processingFeeRemaining(db, await row(loan.id)), 10);
      await assert.rejects(service.deductRequestedLoanFee(randomUUID(), owner.userId, loan.id));
      await service.deductRequestedLoanFee(owner.id, owner.userId, loan.id);
      const completed = await row(loan.id);
      assert.equal(completed.processingFeeSource, "mixed");
      assert.equal(completed.processingFeeDeductedAmount, 10);
      assert.equal((await service.savingsPosition(db, owner.id)).total, 99990);
      assert.equal(await service.processingFeeRemaining(db, completed), 0);
      await service.deductRequestedLoanFee(owner.id, owner.userId, loan.id);
      assert.equal((await service.savingsPosition(db, owner.id)).total, 99990);
    });
    await t.test(
      "own loans enforce 80% including fees; locked savings survive payout and release at payoff",
      async () => {
        const owner = await member("LOAN-OWN");
        await assert.rejects(makeRequest(owner, 80000));
        const created = await makeRequest(owner, 75000);
        assert.equal((await service.savingsPosition(db, owner.id)).available, 22375);
        await assert.rejects(makeRequest(owner, 10000));
        await db
          .update(financeRequests)
          .set({ status: "approved", termsAcceptedAt: new Date() })
          .where(eq(financeRequests.id, created.id));
        const approved = await row(created.id);
        await db.transaction((tx) => service.validateLoanFunding(tx, approved));
        const start = new Date("2026-01-01T00:00:00Z"),
          paidAt = new Date("2026-02-01T00:00:00Z");
        const payout = await payment(approved, "loan", approved.amount, start);
        await settlePayment(payout);
        assert.equal((await service.savingsPosition(db, owner.id)).total, 99250);
        assert.equal((await service.savingsPosition(db, owner.id)).locked, 76875);
        const funded = await row(created.id),
          debt = await service.getLoanBalance(db, funded, paidAt);
        assert.equal(debt.outstanding, 77644);
        const repayment = await payment(funded, "loan_repayment", debt.outstanding, paidAt);
        await Promise.all([settlePayment(repayment), settlePayment(repayment)]);
        assert.equal((await service.getLoanBalance(db, funded)).outstanding, 0);
        assert.equal((await service.savingsPosition(db, owner.id)).available, 99250);
      },
    );
    await t.test("only the nominated owner can consent; concurrent commitments cannot reuse their pool", async () => {
      const supporter = await member("LOAN-BACKER"),
        borrowerA = await member("LOAN-A", 1000),
        borrowerB = await member("LOAN-B", 1000);
      const a = await makeRequest(borrowerA, 58000, {
        loanType: "backed",
        backers: [{ code: supporter.code, amount: 59450 }],
      });
      const b = await makeRequest(borrowerB, 58000, {
        loanType: "backed",
        backers: [{ code: supporter.code, amount: 59450 }],
      });
      const promises = await db.select().from(loanBackings).where(eq(loanBackings.memberId, supporter.id));
      await assert.rejects(service.decideBacking(promises[0].id, borrowerA.id, borrowerA.userId, true));
      const requestA = await row(a.id);
      await assert.rejects(db.transaction((tx) => service.validateLoanFunding(tx, requestA)));
      const outcomes = await Promise.allSettled(
        promises.map((pledge) => service.decideBacking(pledge.id, supporter.id, supporter.userId, true)),
      );
      assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
      assert.equal((await service.savingsPosition(db, supporter.id)).locked, 59450);
      const loser = (
        await db
          .select()
          .from(loanBackings)
          .where(and(eq(loanBackings.memberId, supporter.id), eq(loanBackings.status, "pending")))
      )[0];
      await service.decideBacking(loser.id, supporter.id, supporter.userId, false);
      assert.equal((await row(loser.requestId)).status, "rejected");
      assert.equal((await service.savingsPosition(db, supporter.id)).available, 40550);
      const winner = promises.find((p) => p.id !== loser.id)!,
        fundedRequest = await row(winner.requestId);
      await db.transaction((tx) => service.validateLoanFunding(tx, fundedRequest));
      assert.ok([a.id, b.id].includes(winner.requestId));
    });
    await t.test("a declined backer releases the borrower's own reservation", async () => {
      const borrower = await member("LOAN-DECLINE"),
        supporter = await member("LOAN-DECLINER");
      const data = await makeRequest(borrower, 20000, {
        loanType: "backed",
        ownBackingAmount: 10000,
        backers: [{ code: supporter.code, amount: 10500 }],
      });
      assert.equal((await service.savingsPosition(db, borrower.id)).locked, 10000);
      const [pledge] = await db
        .select()
        .from(loanBackings)
        .where(and(eq(loanBackings.requestId, data.id), eq(loanBackings.isBorrower, false)));
      await service.decideBacking(pledge.id, supporter.id, supporter.userId, false);
      assert.equal((await service.savingsPosition(db, borrower.id)).locked, 0);
    });
    await t.test("deduction mode restores principal proportionally without duplicate restoration", async () => {
      const policy = {
        ...DEFAULT_LOAN_POLICY,
        version: "deduct-fixture",
        backingMode: "deduct" as const,
        release: "proportional" as const,
      };
      await db
        .insert(settings)
        .values({ key: "loanPolicy", value: policy })
        .onConflictDoUpdate({ target: settings.key, set: { value: policy } });
      const borrower = await member("LOAN-DEDUCT");
      const data = await makeRequest(borrower, 20000, { policyVersion: policy.version });
      await db
        .update(financeRequests)
        .set({ status: "approved", termsAcceptedAt: new Date() })
        .where(eq(financeRequests.id, data.id));
      const start = new Date("2026-01-01T00:00:00Z"),
        approved = await row(data.id),
        event = await payment(approved, "loan", approved.amount, start);
      await settlePayment(event);
      assert.equal((await service.savingsPosition(db, borrower.id)).total, 79300);
      const funded = await row(data.id),
        partial = await payment(funded, "loan_repayment", 10000, start);
      await Promise.all([settlePayment(partial), settlePayment(partial)]);
      assert.equal((await service.savingsPosition(db, borrower.id)).total, 89300);
      const end = new Date("2026-02-01T00:00:00Z"),
        debt = await service.getLoanBalance(db, funded, end);
      assert.equal(debt.outstanding, 10605);
      await settlePayment(await payment(funded, "loan_repayment", debt.outstanding, end));
      assert.equal((await service.savingsPosition(db, borrower.id)).total, 99800);
    });
    await t.test("loan reminder checks deduplicate and OneSignal retries reuse the same idempotency key", async () => {
      await db.delete(pushNotifications);
      const borrower = await member("LOAN-OVERDUE");
      const now = new Date(),
        start = new Date(now.getTime() - 100 * 86400000);
      const [loan] = await db
        .insert(financeRequests)
        .values({
          memberId: borrower.id,
          kind: "loan",
          loanType: "backed",
          loanTerms: termsFor(DEFAULT_LOAN_POLICY, "backed"),
          amount: 100000,
          payoutAmount: 97561,
          quotedFee: 2439,
          feePolicy: "member",
          msisdn: "250788924941",
          reason: "Overdue fixture",
          status: "paid",
          repaymentMonths: 1,
          paidAt: start,
        })
        .returning();
      const encryptedKey = encryptPushKey("fixture-rest-key");
      assert.equal(decryptPushKey(encryptedKey), "fixture-rest-key");
      assert.ok(!encryptedKey.includes("fixture-rest-key"));
      assert.throws(() => decryptPushKey(encryptedKey.slice(0, -2) + "aa"));
      await db.insert(settings).values({
        key: "oneSignal",
        value: { appId: "0f8c2b7e-1a45-4c31-9d02-6e8f1b2c3d44", encryptedKey, siteUrl: "https://elayo.example.test" },
      });
      const config = await getPushConfig();
      assert.equal(config.configured, true);
      assert.equal(config.apiKey, "fixture-rest-key");
      const first = await runLoanReminders(now),
        repeated = await runLoanReminders(now);
      assert.ok(first.queued > 0);
      assert.equal(repeated.queued, 0);
      const requests: { idempotency_key: string; include_aliases: { external_id: string[] } }[] = [];
      globalThis.fetch = async (url, init) => {
        assert.equal(url, "https://api.onesignal.com/notifications?c=push");
        assert.equal(new Headers(init?.headers).get("Authorization"), "Key fixture-rest-key");
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ errors: ["temporary failure"] }, { status: 500 });
      };
      assert.equal((await flushPushNotifications(true)).sent, 0);
      globalThis.fetch = async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({ id: "fixture-notification" });
      };
      assert.equal((await flushPushNotifications(true)).sent, first.queued);
      assert.equal(requests[0].idempotency_key, requests[first.queued].idempotency_key);
      assert.ok(requests.some((r) => r.include_aliases.external_id.includes(pushIdentity(borrower.userId))));
      assert.equal((await flushPushNotifications(true)).sent, 0);
      const debt = calculateLoan(loan.amount, start, 1, loan.loanTerms!, [], now).outstanding;
      await db.insert(mobilePayments).values({
        id: randomUUID(),
        memberId: borrower.id,
        requestId: loan.id,
        purpose: "loan_repayment",
        direction: "collect",
        amount: debt,
        appliedAmount: debt,
        mode: "live",
        status: "succeeded",
        completedAt: now,
        createdBy: borrower.userId,
        msisdn: loan.msisdn,
        description: "Final repayment",
      });
      const later = await runLoanReminders(new Date(now.getTime() + 4 * 86400000));
      assert.equal(later.queued, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await client.end();
  }
});
