import { AccountDashboard } from "@/components/account-dashboard";
import { AdminSettings } from "@/components/admin-dashboard";
import { requireRecordEditor } from "@/lib/auth/viewer";
import { hasNoRecords } from "@/app/actions/initial-import";

export default async function SettingsPage() {
  await requireRecordEditor();
  return (
    <AccountDashboard role="admin">
      <AdminSettings needsRecords={await hasNoRecords()} />
    </AccountDashboard>
  );
}
