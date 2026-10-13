import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

test("secretary-set shares and partial savings payments", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /^\/elayo_mobile_money_test_/);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.AUTH_SECRET ??= "fixture-auth-secret";
  const { db, sql: client } = await import("../src/db/index");
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const {
    members,
    users,
    ledgerEntries,
    mobilePayments,
    contributionProofs,
    memberSharePlans,
    savingsPenaltyCycles,
    settings,
  } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const shares = await import("../src/lib/share-plans");
  const proofs = await import("../src/lib/contribution-proofs");
  const { runPenaltyAutomation } = await import("../src/lib/penalty-automation");
  const [member] = await db
    .insert(members)
    .values({ code: "SHARE-MEMBER", surname: "Share member", monthlyCommitment: 15000 })
    .returning();
  const [noShares] = await db.insert(members).values({ code: "SHARE-NONE", surname: "No shares" }).returning();
  const [user] = await db
    .insert(users)
    .values({ memberId: member.id, name: "Share member", role: "member" })
    .returning();
  const [secretary] = await db.insert(users).values({ name: "Share secretary", role: "secretary" }).returning();
  const tx = <T>(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) => db.transaction(work);
  const save = (amount: number, period: string) =>
    db.insert(ledgerEntries).values({
      reference: `SAV-${randomUUID().slice(0, 8)}`,
      memberId: member.id,
      kind: "savings",
      amount,
      period,
      source: "manual",
    });
  try {
    await t.test("existing commitments are each month's target until the secretary schedules a change", async () => {
      assert.equal(await shares.sharesFor(db, member.id, "2026-10"), 3);
      assert.equal(await shares.sharesFor(db, noShares.id, "2026-10"), null);
      await tx((tx) =>
        shares.scheduleShares(tx, {
          memberId: member.id,
          shares: 5,
          effectivePeriod: "2026-12",
          actorId: secretary.id,
        }),
      );
      // The old commitment is kept for earlier months; the new count starts in December.
      assert.equal(await shares.sharesFor(db, member.id, "2026-10"), 3);
      assert.equal(await shares.sharesFor(db, member.id, "2026-12"), 5);
      assert.equal(await shares.sharesFor(db, member.id, "2027-03"), 5);
      const plans = await db.select().from(memberSharePlans).where(eq(memberSharePlans.memberId, member.id));
      assert.equal(plans.length, 2);
      // The cached commitment follows the current savings window, not the future change.
      await shares.refreshCommitments(db, member.id, "2026-11-05");
      assert.equal((await db.select().from(members).where(eq(members.id, member.id)))[0].monthlyCommitment, 15000);
      await shares.refreshCommitments(db, member.id, "2026-12-21");
      assert.equal((await db.select().from(members).where(eq(members.id, member.id)))[0].monthlyCommitment, 25000);
      await shares.refreshCommitments(db, member.id, "2026-11-05");
    });

    await t.test("members fill a month in parts and cannot go beyond the target", async () => {
      await save(4000, "2026-10");
      let allowance = await shares.savingsAllowance(db, member.id, "2026-10");
      assert.deepEqual(
        { target: allowance.target, paid: allowance.paid, remaining: allowance.remaining },
        { target: 15000, paid: 4000, remaining: 11000 },
      );
      await shares.assertSavingsAllowed(db, member.id, "2026-10", 2500);
      await assert.rejects(shares.assertSavingsAllowed(db, member.id, "2026-10", 11001), /Only 11,000 RWF remains/);
      await assert.rejects(shares.assertSavingsAllowed(db, member.id, "2026-10", 50), /at least 100 RWF/);
      // Leaving 1–99 RWF would strand a balance nobody can pay by mobile money.
      await assert.rejects(shares.assertSavingsAllowed(db, member.id, "2026-10", 10950), /leave either nothing/);
      await shares.assertSavingsAllowed(db, member.id, "2026-10", 11000);
      await assert.rejects(shares.assertSavingsAllowed(db, noShares.id, "2026-10", 1000), /not been set/);

      // Live mobile money awaiting confirmation is reserved; test-mode and failed payments are not.
      const payment = (status: "pending" | "failed", mode: "live" | "test", accountAmount: number) =>
        db.insert(mobilePayments).values({
          id: randomUUID(),
          memberId: member.id,
          createdBy: user.id,
          purpose: "savings",
          direction: "collect",
          amount: accountAmount + 100,
          accountAmount,
          msisdn: "250788924941",
          period: "2026-10",
          description: "fixture",
          mode,
          status,
        });
      await payment("pending", "live", 3000);
      await payment("pending", "test", 5000);
      await payment("failed", "live", 5000);
      allowance = await shares.savingsAllowance(db, member.id, "2026-10");
      assert.deepEqual(
        { pending: allowance.pending, remaining: allowance.remaining },
        { pending: 3000, remaining: 8000 },
      );
    });

    await t.test("receipt uploads are capped and reserve their amount while pending", async () => {
      const owner = { id: user.id, role: "member" as const, memberId: member.id };
      const receipt = () =>
        new File([Buffer.from(`%PDF-1.7\n${randomUUID()}\n%%EOF`)], "receipt.pdf", { type: "application/pdf" });
      const input = (amount: number) => ({
        id: randomUUID(),
        kind: "savings",
        amount,
        period: "2026-10",
        paidOn: "2026-10-10",
        method: "Bank transfer",
        paymentReference: `TX-${randomUUID()}`,
        note: "",
      });
      await proofs.submitContributionProof(owner, input(2500), receipt());
      await assert.rejects(proofs.submitContributionProof(owner, input(6000), receipt()), /Only 5,500 RWF remains/);
      await proofs.submitContributionProof(owner, input(5500), receipt());
      assert.equal((await shares.savingsAllowance(db, member.id, "2026-10")).remaining, 0);
      await assert.rejects(proofs.submitContributionProof(owner, input(100), receipt()), /fully paid or awaiting/);
      assert.equal(
        (await db.select().from(contributionProofs).where(eq(contributionProofs.memberId, member.id))).length,
        2,
      );
    });

    await t.test("late-fine cycles freeze the shares scheduled for each month", async () => {
      await db
        .insert(settings)
        .values({
          key: "penaltyPolicy",
          value: { enabled: true, effectivePeriod: "2026-11", basis: "unpaid", pausePending: true },
        });
      await db.update(members).set({ createdAt: new Date("2026-01-01T00:00:00Z") });
      await runPenaltyAutomation("2026-12-21");
      const cycles = await db.select().from(savingsPenaltyCycles).where(eq(savingsPenaltyCycles.memberId, member.id));
      assert.deepEqual(cycles.map((c) => [c.period, c.expectedShares]).sort(), [
        ["2026-11", 3],
        ["2026-12", 5],
      ]);
      assert.equal(
        (await db.select().from(savingsPenaltyCycles).where(eq(savingsPenaltyCycles.memberId, noShares.id))).length,
        0,
      );
    });
  } finally {
    await client.end();
  }
});
