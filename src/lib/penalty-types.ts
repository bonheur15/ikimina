import type { Page } from "./admin-types";

export type PenaltyAssessment = {
  id: string;
  reference: string;
  memberCode: string;
  memberName: string;
  amount: number;
  paid: number;
  remaining: number;
  period: string;
  assessedOn: string;
  reason: string;
};
export type PenaltyAssessmentData = {
  page: Page<PenaltyAssessment>;
  outstanding: number;
  outstandingCount: number;
  status: "outstanding" | "settled" | "all";
};
