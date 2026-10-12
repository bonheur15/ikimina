import { AccountDashboard } from "@/components/account-dashboard";
import { AdminOverview } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadOverview } from "@/lib/admin-queries";

export default async function AdminPage() {
  await requireAdmin();
  return (
    <AccountDashboard role="admin">
      <AdminOverview data={await loadOverview()} />
    </AccountDashboard>
  );
}
