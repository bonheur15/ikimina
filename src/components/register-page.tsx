import { AccountDashboard } from "@/components/account-dashboard";
import { ContributionRegister } from "@/components/contribution-register";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadRegister } from "@/lib/admin-queries";
import { REGISTER_TABS } from "@/lib/admin-types";
import { oneOf, pageParam, param } from "@/lib/search-params";
import type { ContributionKind } from "@/lib/portal-data";
import { loadPenaltyAssessments } from "@/lib/penalties";
import { penaltyAutomationView } from "@/lib/penalty-automation";
import { PenaltyPolicyPanel } from "./penalty-policy";

/** Server page shared by the savings, social fund and penalty registers. */
export async function RegisterPage({
  kind,
  searchParams,
}: {
  kind: ContributionKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const data = await loadRegister(kind, {
    tab: oneOf(params, "tab", REGISTER_TABS, "payments"),
    period: param(params, "period") || (kind === "penalty" ? "all" : ""),
    q: param(params, "q"),
    page: pageParam(params),
    year: param(params, "year") || "all",
  });
  const penalties =
    kind === "penalty"
      ? await loadPenaltyAssessments({
          q: data.q,
          period: data.period,
          page: Math.min(Math.max(1, Number.parseInt(param(params, "penaltyPage"), 10) || 1), 100_000),
          status: oneOf(params, "penaltyStatus", ["outstanding", "settled", "all"] as const, "outstanding"),
        })
      : undefined;
  const automation = kind === "penalty" ? await penaltyAutomationView() : null;
  return (
    <AccountDashboard role="admin">
      <ContributionRegister data={data} penalties={penalties} />
      {automation && <PenaltyPolicyPanel data={automation} />}
    </AccountDashboard>
  );
}
