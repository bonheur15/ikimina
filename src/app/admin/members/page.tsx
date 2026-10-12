import { AccountDashboard } from "@/components/account-dashboard";
import { AdminMembers } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadMembersPage } from "@/lib/admin-queries";
import { MEMBER_FILTERS } from "@/lib/admin-types";
import { oneOf, pageParam, param } from "@/lib/search-params";

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  await requireAdmin();
  const params = await searchParams;
  const data = await loadMembersPage(oneOf(params, "filter", MEMBER_FILTERS, "all"), param(params, "q"), pageParam(params));
  return <AccountDashboard role="admin"><AdminMembers data={data} /></AccountDashboard>;
}
