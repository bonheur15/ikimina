import { AccountDashboard } from "@/components/account-dashboard";
import { requireViewer } from "@/lib/auth/viewer";

export default async function MemberPage() {
  await requireViewer();
  return <AccountDashboard role="member" />;
}
