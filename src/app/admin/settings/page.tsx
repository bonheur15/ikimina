import { AccountDashboard } from "@/components/account-dashboard";
import { AdminSettings } from "@/components/admin-dashboard";
import { requireAdmin } from "@/lib/auth/viewer";
import { hasNoRecords } from "@/app/actions/initial-import";

export default async function SettingsPage() {
  await requireAdmin();
  return <AccountDashboard role="admin"><AdminSettings needsRecords={await hasNoRecords()} /></AccountDashboard>;
}
