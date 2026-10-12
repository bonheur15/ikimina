import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";

// Never point integration tests at an application database. The caller supplies a disposable test database.
test("mobile money accounting and webhook integration", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  assert.match(url.pathname, /^\/elayo_mobile_money_test_/);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.XENDLY_API_KEY = "fixture-key";
  process.env.XENDLY_WEBHOOK_SECRET = "fixture-secret";
  process.env.XENDLY_MODE = "live";
  const { eq, and } = await import("drizzle-orm");
  const { db, sql: client } = await import("../src/db/index");
  const { runMigrations } = await import("../src/db/migrate");
  const { members, users, mobilePayments, ledgerEntries, cashbookEntries, financeRequests, paymentDeliveries } =
    await import("../src/db/schema");
  const { settlePayment, submitPayment, availableSavings, loanOutstanding, loadFinance } =
    await import("../src/lib/mobile-money");
  const { POST } = await import("../src/app/api/payments/xendly/webhook/route");
  const originalFetch = globalThis.fetch;
  try {
    await runMigrations();
    const [member] = await db.insert(members).values({ code: "MM-TEST", surname: "Mobile Money Fixture" }).returning();
    const [user] = await db.insert(users).values({ name: "Fixture", role: "member", memberId: member.id }).returning();
    const create = async (values: Partial<typeof mobilePayments.$inferInsert> = {}) =>
      (
        await db
          .insert(mobilePayments)
          .values({
            id: randomUUID(),
            memberId: member.id,
            purpose: "savings",
            direction: "collect",
            amount: 5000,
            msisdn: "250788924941",
            mode: "live",
            createdBy: user.id,
            period: "2026-10",
            description: "Fixture contribution",
            ...values,
          })
          .returning()
      )[0];
    const provider = (
      row: typeof mobilePayments.$inferSelect,
      status: "pending" | "succeeded" | "failed" = "succeeded",
      id = randomUUID(),
    ) => ({
      id,
      reference: row.id,
      direction: row.direction,
      amount: row.amount,
      fee: 125,
      currency: "RWF" as const,
      msisdn: row.msisdn,
      mode: row.mode,
      status,
      completed_at: status === "pending" ? null : new Date().toISOString(),
    });
    const find = async (id: string) => (await db.select().from(mobilePayments).where(eq(mobilePayments.id, id)))[0];

    await t.test("pending does not credit savings; concurrent success deliveries credit once", async () => {
      const row = await create();
      const pending = provider(row, "pending");
      await settlePayment(pending);
      assert.equal((await db.select().from(ledgerEntries)).length, 0);
      const paid = { ...pending, status: "succeeded" as const, completed_at: new Date().toISOString() };
      await Promise.all([
        settlePayment(paid, "delivery-a"),
        settlePayment(paid, "delivery-a"),
        settlePayment(paid, "delivery-b"),
      ]);
      const entries = await db.select().from(ledgerEntries);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].amount, 5000);
      const book = await db.select().from(cashbookEntries);
      assert.equal(book.length, 2);
      assert.equal(
        book.reduce((n, r) => n + r.moneyIn - r.moneyOut, 0),
        4875,
      );
      assert.equal((await find(row.id)).status, "succeeded");
      await settlePayment(pending);
      assert.equal((await find(row.id)).status, "succeeded");
    });
    await t.test("test, failed, and mismatched events never credit a member", async () => {
      const testRow = await create({ mode: "test" });
      await settlePayment(provider(testRow));
      const failed = await create();
      const failedEvent = provider(failed, "failed");
      await settlePayment(failedEvent);
      assert.equal((await db.select().from(ledgerEntries)).length, 1);
      const invalid = await create();
      const event = provider(invalid);
      for (const change of [
        { amount: 6000 },
        { mode: "test" as const },
        { msisdn: "250789111111" },
        { direction: "payout" as const },
      ])
        await assert.rejects(settlePayment({ ...event, ...change }, `invalid-${randomUUID()}`));
      assert.equal((await find(invalid.id)).status, "created");
      await assert.rejects(settlePayment({ ...failedEvent, status: "succeeded" }));
      assert.equal((await db.select().from(paymentDeliveries)).length, 2);
    });
    await t.test("timeout retries reuse the saved reference and definitive refusals stay failed", async () => {
      const row = await create();
      const event = provider(row, "pending");
      const keys: string[] = [];
      globalThis.fetch = async (_url, options) => {
        keys.push(new Headers(options?.headers).get("Idempotency-Key")!);
        throw new Error("Timeout");
      };
      await assert.rejects(submitPayment(row));
      assert.equal((await find(row.id)).status, "created");
      globalThis.fetch = async (_url, options) => {
        keys.push(new Headers(options?.headers).get("Idempotency-Key")!);
        return Response.json({ success: true, payload: event });
      };
      await submitPayment(await find(row.id));
      assert.deepEqual(keys, [row.id, row.id]);
      globalThis.fetch = async (url) => {
        assert.equal(url, `https://api.xendlypay.com/v1/payments/${event.id}`);
        return Response.json({
          success: true,
          payload: { ...event, status: "succeeded", completed_at: new Date().toISOString() },
        });
      };
      await submitPayment(await find(row.id));
      assert.equal((await find(row.id)).status, "succeeded");
      const refused = await create();
      globalThis.fetch = async () => Response.json({ message: "Business not verified" }, { status: 403 });
      await assert.rejects(submitPayment(refused));
      assert.equal((await find(refused.id)).status, "failed");
    });
    await t.test("minimal create responses are bound then reconciled with the full provider object", async () => {
      const row = await create({ mode: "test", purpose: "social", amount: 100 });
      const event = { ...provider(row, "pending"), fee: 2 };
      const minimal: Partial<typeof event> = { ...event };
      delete minimal.mode;
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (calls === 1) return Response.json({ success: true, payload: minimal });
        throw new Error("GET timeout");
      };
      await assert.rejects(submitPayment(row));
      const saved = await find(row.id);
      assert.equal(saved.providerId, event.id);
      assert.equal(saved.status, "pending");
      globalThis.fetch = async () =>
        Response.json({
          success: true,
          payload: { ...event, status: "succeeded", completed_at: new Date().toISOString() },
        });
      await submitPayment(saved);
      assert.equal((await find(row.id)).status, "succeeded");
    });
    await t.test("withdrawal reservation releases on success and deducts savings exactly once", async () => {
      const [request] = await db
        .insert(financeRequests)
        .values({
          memberId: member.id,
          kind: "withdrawal",
          amount: 10000,
          msisdn: "250788924941",
          reason: "Fixture withdrawal",
          status: "approved",
        })
        .returning();
      assert.equal(await availableSavings(db, member.id), 0);
      const row = await create({ purpose: "withdrawal", direction: "payout", amount: 10000, requestId: request.id });
      const event = provider(row);
      await Promise.all([settlePayment(event), settlePayment(event)]);
      assert.equal(
        (await db.select().from(financeRequests).where(eq(financeRequests.id, request.id)))[0].status,
        "paid",
      );
      const deductions = await db.select().from(ledgerEntries).where(eq(ledgerEntries.kind, "adjustment"));
      assert.equal(deductions.length, 1);
      assert.equal(deductions[0].amount, -10000);
      assert.equal(await availableSavings(db, member.id), 0);
    });
    await t.test("loan disbursement and repayments track debt separately from savings", async () => {
      const [loan] = await db
        .insert(financeRequests)
        .values({
          memberId: member.id,
          kind: "loan",
          amount: 10000,
          interestAmount: 1000,
          repaymentMonths: 3,
          termsAcceptedAt: new Date(),
          msisdn: "250788924941",
          reason: "Fixture loan",
          status: "approved",
        })
        .returning();
      const payout = await create({ purpose: "loan", direction: "payout", amount: 10000, requestId: loan.id });
      await settlePayment(provider(payout));
      const [paidLoan] = await db.select().from(financeRequests).where(eq(financeRequests.id, loan.id));
      assert.equal(await loanOutstanding(db, paidLoan), 11000);
      const repayment = await create({ purpose: "loan_repayment", amount: 5000, requestId: loan.id });
      await settlePayment(provider(repayment));
      assert.equal(await loanOutstanding(db, paidLoan), 6000);
      assert.equal(await availableSavings(db, member.id), 0);
      assert.equal(
        (
          await db
            .select()
            .from(ledgerEntries)
            .where(and(eq(ledgerEntries.memberId, member.id), eq(ledgerEntries.kind, "savings")))
        ).length,
        2,
      );
      const [other] = await db.insert(members).values({ code: "MM-OTHER", surname: "Other" }).returning();
      const scoped = await loadFinance(other.id);
      assert.equal(scoped.payments.length, 0);
      assert.equal(scoped.requests.length, 0);
    });
    await t.test("webhook route verifies signatures, accepts pings and commits valid signed deliveries", async () => {
      const row = await create({ purpose: "social", amount: 1000 });
      const event = provider(row);
      const body = JSON.stringify({ type: "payment.succeeded", data: event });
      const makeRequest = (raw: string, valid = true, timestamp = String(Math.floor(Date.now() / 1000))) =>
        new Request("https://example.test/api/payments/xendly/webhook", {
          method: "POST",
          body: raw,
          headers: {
            "x-xendly-signature": `t=${timestamp},v1=${valid ? createHmac("sha256", "fixture-secret").update(`${timestamp}.${raw}`).digest("hex") : "0".repeat(64)}`,
            "x-xendly-delivery": "route-delivery",
          },
        });
      assert.equal((await POST(makeRequest(body, false))).status, 401);
      assert.equal((await POST(makeRequest(body, true, String(Math.floor(Date.now() / 1000) - 301)))).status, 401);
      assert.equal((await POST(makeRequest('{"type":"ping","data":{}}'))).status, 200);
      assert.equal((await POST(makeRequest(body))).status, 200);
      assert.equal((await POST(makeRequest(body))).status, 200);
      assert.equal((await find(row.id)).status, "succeeded");
    });
    await t.test("member fees preserve shares and charge actual withdrawal costs without a group subsidy", async () => {
      const [feeMember] = await db
        .insert(members)
        .values({ code: "MM-FEE", surname: "Member Fee Fixture" })
        .returning();
      const savings = await create({
        memberId: feeMember.id,
        amount: 5128,
        accountAmount: 5000,
        quotedFee: 128,
        feePolicy: "member",
      });
      await settlePayment({ ...provider(savings), fee: 128 });
      assert.equal(await availableSavings(db, feeMember.id), 5000);
      const changedFee = await create({
        memberId: feeMember.id,
        amount: 5128,
        accountAmount: 5000,
        quotedFee: 128,
        feePolicy: "member",
      });
      await settlePayment({ ...provider(changedFee), fee: 130 });
      assert.equal(await availableSavings(db, feeMember.id), 9998);
      const topUp = await create({
        memberId: feeMember.id,
        amount: 5128,
        accountAmount: 5000,
        quotedFee: 128,
        feePolicy: "member",
      });
      await settlePayment({ ...provider(topUp), fee: 128 });
      const [withdrawal] = await db
        .insert(financeRequests)
        .values({
          memberId: feeMember.id,
          kind: "withdrawal",
          amount: 10250,
          payoutAmount: 10000,
          quotedFee: 250,
          feePolicy: "member",
          msisdn: "250788924941",
          reason: "Fee-inclusive withdrawal",
          status: "approved",
        })
        .returning();
      assert.equal(await availableSavings(db, feeMember.id), 4748);
      const payout = await create({
        memberId: feeMember.id,
        purpose: "withdrawal",
        direction: "payout",
        amount: 10000,
        accountAmount: 10250,
        quotedFee: 250,
        feePolicy: "member",
        requestId: withdrawal.id,
      });
      const completed = { ...provider(payout), fee: 250 };
      await Promise.all([settlePayment(completed), settlePayment(completed)]);
      assert.equal(await availableSavings(db, feeMember.id), 4748);
      assert.equal((await find(payout.id)).appliedAmount, 10250);
    });
    await t.test("member-paid collection fees are excluded from loan repayments", async () => {
      const [borrower] = await db
        .insert(members)
        .values({ code: "MM-FEE-LOAN", surname: "Loan Fee Fixture" })
        .returning();
      const [loan] = await db
        .insert(financeRequests)
        .values({
          memberId: borrower.id,
          kind: "loan",
          amount: 10250,
          payoutAmount: 10000,
          quotedFee: 250,
          feePolicy: "member",
          interestAmount: 0,
          repaymentMonths: 3,
          termsAcceptedAt: new Date(),
          msisdn: "250788924941",
          reason: "Member-funded payout fee",
          status: "approved",
        })
        .returning();
      const payout = await create({
        memberId: borrower.id,
        purpose: "loan",
        direction: "payout",
        amount: 10000,
        accountAmount: 10250,
        quotedFee: 250,
        feePolicy: "member",
        requestId: loan.id,
      });
      await settlePayment({ ...provider(payout), fee: 250 });
      const [funded] = await db.select().from(financeRequests).where(eq(financeRequests.id, loan.id));
      assert.equal(await loanOutstanding(db, funded), 10250);
      const repayment = await create({
        memberId: borrower.id,
        purpose: "loan_repayment",
        amount: 5128,
        accountAmount: 5000,
        quotedFee: 128,
        feePolicy: "member",
        requestId: loan.id,
      });
      await settlePayment({ ...provider(repayment), fee: 128 });
      assert.equal(await loanOutstanding(db, funded), 5250);
      const finalPayment = await create({
        memberId: borrower.id,
        purpose: "loan_repayment",
        amount: 5384,
        accountAmount: 5250,
        quotedFee: 134,
        feePolicy: "member",
        requestId: loan.id,
      });
      await settlePayment({ ...provider(finalPayment), fee: 130 });
      assert.equal(await loanOutstanding(db, funded), 0);
      assert.equal(await availableSavings(db, borrower.id), 4);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await client.end();
  }
});
