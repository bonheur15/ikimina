import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LOAN_POLICY, addLoanMonths, calculateLoan, loanPolicySchema, termsFor } from "../src/lib/loan-policy";
import { canApproveLoans, canEditRecords, canManageGovernance, canReadGroup, type Role } from "../src/lib/permissions";

test("defaults implement the two agreed rates and lock backing until full repayment", () => {
  assert.equal(DEFAULT_LOAN_POLICY.savingsLimitBps, 8000);
  assert.equal(DEFAULT_LOAN_POLICY.savings.rateBps, 100);
  assert.equal(DEFAULT_LOAN_POLICY.backed.rateBps, 500);
  assert.equal(DEFAULT_LOAN_POLICY.backed.periodMonths, 3);
  assert.equal(DEFAULT_LOAN_POLICY.backingMode, "lock");
  assert.equal(DEFAULT_LOAN_POLICY.release, "full_repayment");
  assert.equal(DEFAULT_LOAN_POLICY.savings.maxMonths, 12);
  assert.equal(DEFAULT_LOAN_POLICY.backed.maxMonths, 12);
  assert.equal(loanPolicySchema.safeParse({ ...DEFAULT_LOAN_POLICY, savingsLimitBps: 10001 }).success, false);
  assert.equal(loanPolicySchema.safeParse({ ...DEFAULT_LOAN_POLICY, minBackers: 3, maxBackers: 1 }).success, false);
});
test("simple and compound monthly interest match 102000 and 102010 after two months", () => {
  const start = new Date("2026-01-01T00:00:00Z"),
    end = new Date("2026-03-01T00:00:00Z"),
    terms = termsFor(DEFAULT_LOAN_POLICY, "savings");
  assert.equal(calculateLoan(100000, start, 12, terms, [], end).outstanding, 102000);
  assert.equal(calculateLoan(100000, start, 12, { ...terms, method: "compound" }, [], end).outstanding, 102010);
});
test("member-backed interest is 5% over the calendar quarter and a fraction on early payoff", () => {
  const start = new Date("2026-01-01T00:00:00Z"),
    terms = termsFor(DEFAULT_LOAN_POLICY, "backed");
  assert.equal(calculateLoan(100000, start, 12, terms, [], new Date("2026-04-01T00:00:00Z")).outstanding, 105000);
  const early = new Date("2026-02-01T00:00:00Z"),
    debt = calculateLoan(100000, start, 12, terms, [], early);
  assert.equal(debt.interestRemaining, Math.ceil((5000 * 31) / 90));
  const paid = calculateLoan(
    100000,
    start,
    12,
    terms,
    [{ id: "payoff", amount: debt.outstanding, at: early }],
    new Date("2026-09-01T00:00:00Z"),
  );
  assert.equal(paid.outstanding, 0);
  assert.equal(paid.principalPaid, 100000);
});
test("partial repayments change principal and obey the configured repayment ordering", () => {
  const start = new Date("2026-01-01T00:00:00Z"),
    terms = termsFor(DEFAULT_LOAN_POLICY, "savings");
  const events = [{ id: "partial", amount: 11000, at: new Date("2026-02-01T00:00:00Z") }];
  const balance = calculateLoan(100000, start, 12, terms, events, new Date("2026-03-01T00:00:00Z"));
  assert.equal(balance.principalRemaining, 90000);
  assert.equal(balance.interestRemaining, 900);
  assert.equal(balance.interestPaid, 1000);
  const alternative = calculateLoan(
    100000,
    start,
    12,
    { ...terms, repaymentOrder: "principal_first" },
    events,
    new Date("2026-02-01T00:00:00Z"),
  );
  assert.equal(alternative.principalRemaining, 89000);
  assert.equal(alternative.interestRemaining, 1000);
});
test("month-end due dates clamp correctly and interest can stop at maturity", () => {
  const start = new Date("2026-01-31T12:00:00Z"),
    terms = termsFor(DEFAULT_LOAN_POLICY, "savings");
  assert.equal(addLoanMonths(start, 1).toISOString(), "2026-02-28T12:00:00.000Z");
  const balance = calculateLoan(
    100000,
    start,
    1,
    { ...terms, accrueAfterDue: false, graceDays: 2 },
    [],
    new Date("2026-03-04T12:00:00Z"),
  );
  assert.equal(balance.interestRemaining, 1000);
  assert.equal(balance.overdueDays, 2);
});
test("only managers approve loans; managers read records but cannot edit or manage governance", () => {
  for (const role of ["member", "secretary", "manager", "superadmin"] as Role[]) {
    assert.equal(canApproveLoans(role), role === "manager");
    assert.equal(canManageGovernance(role), role === "superadmin");
    assert.equal(canReadGroup(role), role !== "member");
    assert.equal(canEditRecords(role), ["secretary", "superadmin"].includes(role));
  }
});
