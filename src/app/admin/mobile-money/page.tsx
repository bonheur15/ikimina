import { AccountDashboard } from "@/components/account-dashboard";
import { AdminMobileMoney } from "@/components/mobile-money-panel";
import { requireAdmin } from "@/lib/auth/viewer";
import { loadFinance } from "@/lib/mobile-money";
import { getPaymentConfig } from "@/lib/payment-settings";

export default async function MobileMoneyPage() {
  await requireAdmin();
  return (
    <AccountDashboard role="admin">
      <AdminMobileMoney data={await loadFinance()} config={await getPaymentConfig()} />
    </AccountDashboard>
  );
}
