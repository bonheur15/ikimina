import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

test(
  "daily penalties and delay handling in an isolated database",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    assert.match(new URL(process.env.TEST_DATABASE_URL!).pathname, /^\/elayo_penalty_test_/);
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    delete process.env.ONESIGNAL_APP_ID;
    delete process.env.ONESIGNAL_REST_API_KEY;
    const { db, sql } = await import("../src/db/index");
    const { runMigrations } = await import("../src/db/migrate");
    const schema = await import("../src/db/schema");
    const { runPenaltyAutomation, memberPenaltyPlan } = await import("../src/lib/penalty-automation");
    const { loadMemberPenalties } = await import("../src/lib/penalties");
    const { eq } = await import("drizzle-orm");
    const reset = async () => {
      await sql`truncate push_notifications, audit_log, ledger_entries, penalty_assessments, penalty_delay_requests, savings_penalty_cycles, users, members, settings cascade`;
      await db.insert(schema.settings).values({
        key: "penaltyPolicy",
        value: { enabled: true, effectivePeriod: "2026-10", basis: "unpaid", pausePending: true },
      });
    };
    const fixture = async (values: Partial<typeof schema.members.$inferInsert> = {}) => {
      const [member] = await db
        .insert(schema.members)
        .values({
          code: `FX-${randomUUID().slice(0, 8)}`,
          surname: "Penalty fixture",
          monthlyCommitment: 50000,
          createdAt: new Date("2026-10-01T00:00:00Z"),
          ...values,
        })
        .returning();
      const [user] = await db.insert(schema.users).values({ name: "Fixture", memberId: member.id }).returning();
      return { member, user };
    };
    try {
      await runMigrations();
      await t.test(
        "day 11, concurrent retries, partial savings, ten-day cap, receipts and member isolation",
        async () => {
          await reset();
          const { member } = await fixture();
          const other = await fixture({ monthlyCommitment: 0 });
          assert.equal((await runPenaltyAutomation("2026-11-10")).created, 0);
          const concurrent = await Promise.all([
            runPenaltyAutomation("2026-11-11"),
            runPenaltyAutomation("2026-11-11"),
          ]);
          assert.equal(
            concurrent.reduce((n, r) => n + r.created, 0),
            1,
          );
          assert.equal((await db.select().from(schema.penaltyAssessments))[0].amount, 5000);
          assert.equal((await db.select().from(schema.ledgerEntries)).length, 0);
          await db.insert(schema.ledgerEntries).values({
            reference: "FIXTURE-SAVING",
            memberId: member.id,
            kind: "savings",
            amount: 30000,
            period: "2026-10",
            paidAt: new Date("2026-11-11T10:00:00+02:00"),
          });
          assert.equal((await runPenaltyAutomation("2026-11-12")).created, 1);
          assert.equal(
            (await loadMemberPenalties(member.id)).reduce((n, p) => n + p.amount, 0),
            7000,
          );
          await runPenaltyAutomation("2026-11-25");
          const fines = await db.select().from(schema.penaltyAssessments);
          assert.equal(fines.length, 10);
          assert.equal(
            fines.reduce((n, p) => n + p.amount, 0),
            23000,
          );
          assert.equal((await runPenaltyAutomation("2026-11-26")).created, 0);
          assert.equal((await loadMemberPenalties(other.member.id)).length, 0);
          assert.equal((await db.select().from(schema.pushNotifications)).length, 10);
          assert.equal((await db.select().from(schema.ledgerEntries)).length, 1);
        },
      );
      await t.test(
        "pending reasons and approved deadlines defer the first charge, without catch-up charges",
        async () => {
          await reset();
          const { member } = await fixture();
          const [request] = await db
            .insert(schema.penaltyDelayRequests)
            .values({
              memberId: member.id,
              period: "2026-10",
              reason: "Fixture delay reason",
              requestedUntil: "2026-11-20",
              createdAt: new Date("2026-11-09T12:00:00+02:00"),
            })
            .returning();
          assert.equal((await runPenaltyAutomation("2026-11-15")).created, 0);
          await db
            .update(schema.penaltyDelayRequests)
            .set({ status: "approved", deferredUntil: "2026-11-20", reviewedAt: new Date("2026-11-15T12:00:00+02:00") })
            .where(eq(schema.penaltyDelayRequests.id, request.id));
          assert.equal((await runPenaltyAutomation("2026-11-20")).created, 0);
          assert.equal((await runPenaltyAutomation("2026-11-21")).created, 1);
          assert.equal((await loadMemberPenalties(member.id))[0].assessedOn, "2026-11-21");
          await runPenaltyAutomation("2026-12-02");
          assert.equal((await db.select().from(schema.penaltyAssessments)).length, 10);
          assert.equal((await memberPenaltyPlan(member.id)).requests[0].status, "approved");
        },
      );
      await t.test("rejections resume next day, paid savings stop charges, and commitments are frozen", async () => {
        await reset();
        const { member } = await fixture();
        const [request] = await db
          .insert(schema.penaltyDelayRequests)
          .values({
            memberId: member.id,
            period: "2026-10",
            reason: "Fixture delay reason",
            requestedUntil: "2026-11-20",
            createdAt: new Date("2026-11-09T12:00:00+02:00"),
          })
          .returning();
        await runPenaltyAutomation("2026-11-15");
        await db
          .update(schema.penaltyDelayRequests)
          .set({ status: "rejected", reviewedAt: new Date("2026-11-16T12:00:00+02:00") })
          .where(eq(schema.penaltyDelayRequests.id, request.id));
        await db.update(schema.members).set({ monthlyCommitment: 100000 }).where(eq(schema.members.id, member.id));
        assert.equal((await runPenaltyAutomation("2026-11-17")).created, 1);
        assert.equal((await db.select().from(schema.penaltyAssessments))[0].amount, 5000);
        await db.insert(schema.ledgerEntries).values({
          reference: "FULL-SAVING",
          memberId: member.id,
          kind: "savings",
          amount: 50000,
          period: "2026-10",
          paidAt: new Date("2026-11-17T10:00:00+02:00"),
        });
        assert.equal((await runPenaltyAutomation("2026-11-25")).created, 0);
      });
      await t.test("former, missing, invalid and new members are not retrospectively fined", async () => {
        await reset();
        await fixture({ status: "former" });
        await fixture({ monthlyCommitment: null });
        await fixture({ monthlyCommitment: 12000 });
        await fixture({ createdAt: new Date("2026-11-12T12:00:00Z") });
        assert.equal((await runPenaltyAutomation("2026-11-21")).created, 0);
        assert.equal((await db.select().from(schema.penaltyAssessments)).length, 0);
        assert.deepEqual(
          (await db.select().from(schema.savingsPenaltyCycles)).map((c) => c.period),
          ["2026-11"],
        );
      });
      await t.test("inactive periods and administrator pauses do not turn into backdated fines", async () => {
        await reset();
        const { member } = await fixture();
        assert.equal((await runPenaltyAutomation("2026-11-11")).created, 1);
        await db.update(schema.members).set({ status: "former" }).where(eq(schema.members.id, member.id));
        assert.equal((await runPenaltyAutomation("2026-11-15")).created, 0);
        await db.update(schema.members).set({ status: "active" }).where(eq(schema.members.id, member.id));
        assert.equal((await runPenaltyAutomation("2026-11-16")).created, 1);
        await db
          .update(schema.settings)
          .set({ value: { enabled: false, effectivePeriod: "2026-10", basis: "unpaid", pausePending: true } })
          .where(eq(schema.settings.key, "penaltyPolicy"));
        assert.equal((await runPenaltyAutomation("2026-11-22")).created, 0);
        await db
          .update(schema.settings)
          .set({ value: { enabled: true, effectivePeriod: "2026-10", basis: "unpaid", pausePending: true } })
          .where(eq(schema.settings.key, "penaltyPolicy"));
        assert.equal((await runPenaltyAutomation("2026-11-23")).created, 1);
        assert.equal((await db.select().from(schema.penaltyAssessments)).length, 3);
      });
      await t.test("OneSignal retries keep the same idempotency key and never claim failed delivery", async () => {
        await reset();
        const { user } = await fixture();
        const [notification] = await db
          .insert(schema.pushNotifications)
          .values({
            eventKey: "push-fixture",
            userId: user.id,
            title: "Fixture notification",
            body: "Fixture body",
            path: "/member",
          })
          .returning();
        const originalAuthUrl = process.env.AUTH_URL;
        process.env.AUTH_URL = "https://elayo.example.test";
        process.env.ONESIGNAL_APP_ID = "fixture-app";
        process.env.ONESIGNAL_REST_API_KEY = "fixture-key";
        process.env.AUTH_SECRET = "fixture-auth";
        const { flushPushNotifications, pushIdentity } = await import("../src/lib/onesignal");
        const originalFetch = globalThis.fetch;
        const keys: string[] = [];
        try {
          globalThis.fetch = async (_url, init) => {
            const payload = JSON.parse(String(init?.body));
            keys.push(payload.idempotency_key);
            assert.deepEqual(payload.include_aliases.external_id, [pushIdentity(user.id)]);
            throw new Error("Fixture network failure");
          };
          assert.equal((await flushPushNotifications()).sent, 0);
          assert.equal((await db.select().from(schema.pushNotifications))[0].sentAt, null);
          await db
            .update(schema.pushNotifications)
            .set({ attemptedAt: null })
            .where(eq(schema.pushNotifications.id, notification.id));
          globalThis.fetch = async (_url, init) => {
            const payload = JSON.parse(String(init?.body));
            keys.push(payload.idempotency_key);
            return Response.json({ id: "fixture-delivery" });
          };
          assert.equal((await flushPushNotifications()).sent, 1);
          assert.equal((await flushPushNotifications()).sent, 0);
          assert.deepEqual(keys, [notification.id, notification.id]);
        } finally {
          if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
          else process.env.AUTH_URL = originalAuthUrl;
          globalThis.fetch = originalFetch;
          delete process.env.ONESIGNAL_APP_ID;
          delete process.env.ONESIGNAL_REST_API_KEY;
        }
      });
    } finally {
      await sql.end();
    }
  },
);
