import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyPenalty, pausedOn, savingsContributionPeriod, savingsWindow } from "../src/lib/penalty-policy";

test("savings windows cross month and year boundaries", () => {
  assert.deepEqual(savingsWindow("2026-12"), {
    startsOn: "2026-12-20",
    dueOn: "2027-01-10",
    penaltiesFrom: "2027-01-11",
  });
  assert.equal(savingsWindow("2028-02").dueOn, "2028-03-10");
  assert.equal(savingsContributionPeriod("2026-11-10"), "2026-10");
  assert.equal(savingsContributionPeriod("2026-11-19"), "2026-10");
  assert.equal(savingsContributionPeriod("2026-11-20"), "2026-11");
});
test("daily rate uses unpaid shares, stops when paid and caps at ten charged days", () => {
  assert.deepEqual(dailyPenalty(10, 30000, 0), { shares: 4, amount: 2000 });
  assert.deepEqual(dailyPenalty(10, 30000, 9), { shares: 4, amount: 2000 });
  assert.deepEqual(dailyPenalty(10, 30000, 10), { shares: 0, amount: 0 });
  assert.deepEqual(dailyPenalty(10, 50000, 0), { shares: 0, amount: 0 });
  assert.deepEqual(dailyPenalty(10, 30000, 0, "committed"), { shares: 10, amount: 5000 });
  assert.deepEqual(dailyPenalty(1, 2500, 0), { shares: 1, amount: 500 });
});
test("pending and approved reasons pause charges; rejection resumes the following day", () => {
  const pending = { status: "pending" as const, submittedOn: "2026-11-09", reviewedOn: null, deferredUntil: null };
  assert.equal(pausedOn("2026-11-11", pending, true), true);
  assert.equal(pausedOn("2026-11-11", pending, false), false);
  const approved = { ...pending, status: "approved" as const, reviewedOn: "2026-11-12", deferredUntil: "2026-11-20" };
  assert.equal(pausedOn("2026-11-20", approved, true), true);
  assert.equal(pausedOn("2026-11-21", approved, true), false);
  const rejected = { ...pending, status: "rejected" as const, reviewedOn: "2026-11-12" };
  assert.equal(pausedOn("2026-11-12", rejected, true), true);
  assert.equal(pausedOn("2026-11-13", rejected, true), false);
});
