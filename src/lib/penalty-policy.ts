import { SHARE_VALUE, kigaliToday } from "./portal-data";

export const DAILY_PENALTY_PER_SHARE = 500;
export const MAX_PENALTY_DAYS = 10;
export type PenaltyPolicy = {
  enabled: boolean;
  effectivePeriod: string;
  basis: "unpaid" | "committed";
  pausePending: boolean;
};
export type DelayState = {
  status: "pending" | "approved" | "rejected";
  submittedOn: string;
  reviewedOn: string | null;
  deferredUntil: string | null;
};

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function savingsWindow(period: string) {
  const [year, month] = period.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 10)).toISOString().slice(0, 10);
  return { startsOn: `${period}-20`, dueOn: next, penaltiesFrom: addDays(next, 1) };
}
/** Payments made before the 20th normally belong to the preceding savings window. */
export function savingsContributionPeriod(today = kigaliToday()) {
  if (Number(today.slice(8)) >= 20) return today.slice(0, 7);
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
export function unpaidShares(expectedShares: number, savingsPaid: number) {
  return Math.max(0, Math.ceil((expectedShares * SHARE_VALUE - savingsPaid) / SHARE_VALUE));
}
export function dailyPenalty(
  expectedShares: number,
  savingsPaid: number,
  chargedDays: number,
  basis: PenaltyPolicy["basis"] = "unpaid",
) {
  const missing = unpaidShares(expectedShares, savingsPaid);
  if (chargedDays >= MAX_PENALTY_DAYS || missing === 0) return { shares: 0, amount: 0 };
  const shares = basis === "committed" ? expectedShares : missing;
  return { shares, amount: shares * DAILY_PENALTY_PER_SHARE };
}
export function pausedOn(date: string, request: DelayState | null, pausePending: boolean) {
  if (!request || date < request.submittedOn) return false;
  if (request.status === "pending") return pausePending;
  if (request.status === "approved") return !!request.deferredUntil && date <= request.deferredUntil;
  return pausePending && !!request.reviewedOn && date <= request.reviewedOn;
}
