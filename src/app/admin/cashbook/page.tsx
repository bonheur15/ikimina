import { AccountDashboard } from "@/components/account-dashboard";
import { AdminCashbook } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadCashbook } from "@/lib/admin-queries";
import { CASH_FLOWS } from "@/lib/admin-types";
import { oneOf, pageParam, param } from "@/lib/search-params";

export default async function CashbookPage({ searchParams }: PageProps<"/admin/cashbook">) {
  await requireAdmin();
  const params = await searchParams;
  // The sheet shows the book in its original order, more rows per page.
  const sheet = param(params, "view") === "sheet";
  const data = await loadCashbook(param(params, "year"), oneOf(params, "flow", CASH_FLOWS, "all"), pageParam(params), sheet ? 100 : 30, sheet ? "asc" : "desc");
  return <AccountDashboard role="admin"><AdminCashbook data={data} /></AccountDashboard>;
}
