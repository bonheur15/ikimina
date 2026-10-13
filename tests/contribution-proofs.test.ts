import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

test("private contribution receipts and secretary accounting", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /^\/elayo_mobile_money_test_/);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { db, sql: client } = await import("../src/db/index");
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const { members, users, ledgerEntries, cashbookEntries, contributionProofs, pushNotifications } =
    await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const service = await import("../src/lib/contribution-proofs");
  const { savingsPosition } = await import("../src/lib/loan-service");
  const [member] = await db
    .insert(members)
    .values({ code: "PROOF-MEMBER", surname: "Receipt member", monthlyCommitment: 50000 })
    .returning();
  const [borrower] = await db
    .insert(users)
    .values({ memberId: member.id, name: "Receipt member", role: "member" })
    .returning();
  const [secretary] = await db.insert(users).values({ name: "Receipt secretary", role: "secretary" }).returning();
  const owner = { id: borrower.id, role: "member" as const, memberId: member.id },
    reviewer = { id: secretary.id, role: "secretary" as const, memberId: null };
  const receipt = (label = randomUUID()) =>
    new File([Buffer.from(`%PDF-1.7\n${label}\n%%EOF`)], "receipt.pdf", { type: "application/pdf" });
  const input = (extra = {}) => ({
    id: randomUUID(),
    kind: "savings",
    amount: 10000,
    period: "2026-10",
    paidOn: "2026-10-10",
    method: "Bank transfer",
    paymentReference: `TX-${randomUUID()}`,
    note: "Payment fixture",
    ...extra,
  });
  const proof = async (id: string) =>
    (await db.select().from(contributionProofs).where(eq(contributionProofs.id, id)))[0];
  try {
    await t.test(
      "pending receipts do not credit money; concurrent review credits one ledger and one cashbook entry",
      async () => {
        const data = input(),
          file = receipt();
        await service.submitContributionProof(owner, data, file);
        await service.submitContributionProof(owner, data, file);
        assert.equal((await savingsPosition(db, member.id)).total, 0);
        assert.equal((await db.select().from(cashbookEntries)).length, 0);
        const rows = await service.loadContributionProofs(member.id);
        assert.equal(rows.length, 1);
        assert.ok(!("file" in rows[0]));
        for (const role of ["member", "manager", "superadmin"] as const)
          await assert.rejects(
            service.reviewContributionProof(
              { ...reviewer, role },
              { id: data.id, approve: true, note: "Verified payment" },
            ),
            /Only the secretary/,
          );
        await Promise.all([
          service.reviewContributionProof(reviewer, {
            id: data.id,
            approve: true,
            note: "Verified against bank statement",
          }),
          service.reviewContributionProof(reviewer, { id: data.id, approve: true, note: "Concurrent confirmation" }),
        ]);
        assert.equal((await savingsPosition(db, member.id)).total, 10000);
        const ledger = await db.select().from(ledgerEntries),
          cashbook = await db.select().from(cashbookEntries);
        assert.equal(ledger.length, 1);
        assert.equal(ledger[0].amount, 10000);
        assert.match(ledger[0].reference, /^CP-/);
        assert.equal(ledger[0].method, "Bank transfer");
        assert.equal(cashbook.length, 1);
        assert.equal(cashbook[0].moneyIn, 10000);
        assert.equal((await proof(data.id)).ledgerEntryId, ledger[0].id);
        assert.equal((await db.select().from(pushNotifications)).length, 2);
        await assert.rejects(service.submitContributionProof(owner, input(), file), /already been submitted/);
        await assert.rejects(
          service.submitContributionProof(
            owner,
            input({ paymentReference: ` ${data.paymentReference.toLowerCase()} ` }),
            receipt(),
          ),
          /already been submitted/,
        );
        await assert.rejects(service.cancelContributionProof(owner, data.id), /Only a pending/);
      },
    );
    await t.test(
      "decline and cancellation leave savings unchanged; corrected receipts can be resubmitted",
      async () => {
        const data = input({ kind: "social", amount: 2000 }),
          file = receipt();
        await service.submitContributionProof(owner, data, file);
        await service.reviewContributionProof(reviewer, {
          id: data.id,
          approve: false,
          note: "Reference not found in group receipts",
        });
        assert.equal((await proof(data.id)).status, "rejected");
        assert.equal((await proof(data.id)).reviewNote, "Reference not found in group receipts");
        await assert.rejects(
          service.reviewContributionProof(reviewer, { id: data.id, approve: true, note: "Invalid late approval" }),
          /already been reviewed/,
        );
        const corrected = { ...data, id: randomUUID() };
        await service.submitContributionProof(owner, corrected, file);
        await assert.rejects(
          service.cancelContributionProof({ ...owner, memberId: randomUUID() }, corrected.id),
          /not found/,
        );
        await service.cancelContributionProof(owner, corrected.id);
        assert.equal((await proof(corrected.id)).status, "cancelled");
        await assert.rejects(
          service.reviewContributionProof(reviewer, {
            id: corrected.id,
            approve: true,
            note: "Invalid cancelled approval",
          }),
          /already been reviewed/,
        );
        assert.equal((await savingsPosition(db, member.id)).total, 10000);
        assert.equal((await db.select().from(ledgerEntries)).length, 1);
      },
    );
    await t.test("social and cash contributions are accounted separately without invented provider fees", async () => {
      const data = input({ kind: "social", amount: 2000, method: "Cash", paymentReference: "" });
      await service.submitContributionProof(owner, data, receipt());
      await service.reviewContributionProof(reviewer, { id: data.id, approve: true, note: "Cash receipt verified" });
      assert.equal((await savingsPosition(db, member.id)).total, 10000);
      const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.kind, "social"));
      assert.equal(rows[0].amount, 2000);
      assert.equal(rows[0].method, "Cash");
      assert.equal(
        (await db.select().from(cashbookEntries)).reduce((sum, row) => sum + row.moneyIn - row.moneyOut, 0),
        12000,
      );
    });
    await t.test(
      "invalid uploads, dates and savings shares are rejected; ownership governs receipt access",
      async () => {
        await assert.rejects(
          // Partial shares are allowed, but never more than the month's 10 shares (50,000 RWF).
          service.submitContributionProof(owner, input({ amount: 50100, period: "2026-09" }), receipt()),
          /Only 50,000 RWF remains/,
        );
        await assert.rejects(
          service.submitContributionProof(owner, input({ paidOn: "2099-01-01" }), receipt()),
          /valid payment date/,
        );
        await assert.rejects(
          service.submitContributionProof(owner, input({ paidOn: "2026-02-31" }), receipt()),
          /valid payment date/,
        );
        await assert.rejects(
          service.submitContributionProof(owner, input({ paymentReference: "" }), receipt()),
          /transaction reference/,
        );
        await assert.rejects(
          service.submitContributionProof(
            owner,
            input(),
            new File(["<script>alert(1)</script>"], "fake.png", { type: "image/png" }),
          ),
          /JPG, PNG or PDF/,
        );
        await assert.rejects(
          service.submitContributionProof(
            owner,
            input(),
            new File([Buffer.alloc(service.MAX_RECEIPT_BYTES + 1)], "huge.pdf", { type: "application/pdf" }),
          ),
          /up to 5 MB/,
        );
        await assert.rejects(
          service.submitContributionProof(owner, input(), new File([], "empty.pdf", { type: "application/pdf" })),
          /up to 5 MB/,
        );
        assert.equal(service.canAccessContributionProof(owner, member.id), true);
        assert.equal(service.canAccessContributionProof({ ...owner, memberId: randomUUID() }, member.id), false);
        assert.equal(service.canAccessContributionProof(reviewer, member.id), true);
        const data = input();
        await service.submitContributionProof(owner, data, receipt());
        await db.update(members).set({ status: "former" }).where(eq(members.id, member.id));
        await assert.rejects(
          service.reviewContributionProof(reviewer, { id: data.id, approve: true, note: "Former member fixture" }),
          /no longer active/,
        );
        await service.reviewContributionProof(reviewer, {
          id: data.id,
          approve: false,
          note: "Member no longer active",
        });
      },
    );
  } finally {
    await client.end();
  }
});
