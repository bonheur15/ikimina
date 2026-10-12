import { AccountDashboard } from "@/components/account-dashboard";
import { ContributionRegister } from "@/components/contribution-register";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadRegister } from "@/lib/admin-queries";
import { REGISTER_TABS } from "@/lib/admin-types";
import { oneOf, pageParam, param } from "@/lib/search-params";
import type { ContributionKind } from "@/lib/portal-data";

/** Server page shared by the savings, social fund and penalty registers. */
export async function RegisterPage({ kind, searchParams }: { kind: ContributionKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const data = await loadRegister(kind, {
    tab: oneOf(params, "tab", REGISTER_TABS, "payments"), period: param(params, "period") || (kind === "penalty" ? "all" : ""),
    q: param(params, "q"), page: pageParam(params), year: param(params, "year") || "all",
  });
  return <AccountDashboard role="admin"><ContributionRegister data={data} /></AccountDashboard>;
}
