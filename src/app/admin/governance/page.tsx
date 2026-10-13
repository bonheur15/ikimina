import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { users, pushNotifications } from "@/db/schema";
import { AccountDashboard } from "@/components/account-dashboard";
import { GovernancePanel } from "@/components/governance-panel";
import { requireAdmin } from "@/lib/auth/viewer";
import { getLoanPolicy } from "@/lib/loan-service";
import { getPushConfig } from "@/lib/notification-settings";
import { getPaymentSettingsView } from "@/lib/payment-settings";

export default async function GovernancePage() {
  const viewer = await requireAdmin();
  const supers = await db.$count(users, eq(users.role, "superadmin"));
  const superadmin = viewer.role === "superadmin";
  const accounts = superadmin
    ? await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          disabled: sql<boolean>`${users.disabledAt} is not null`,
          ready: sql<boolean>`${users.passwordHash} is not null`,
        })
        .from(users)
        .orderBy(users.name)
        .limit(300)
    : viewer.role === "secretary"
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            disabled: sql<boolean>`${users.disabledAt} is not null`,
            ready: sql<boolean>`${users.passwordHash} is not null`,
          })
          .from(users)
          .where(and(eq(users.role, "superadmin"), isNull(users.passwordHash)))
          .limit(1)
      : [];
  const config = superadmin ? await getPushConfig() : null;
  const h = await headers();
  const origin = (
    config?.siteUrl ||
    process.env.AUTH_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`
  ).replace(/\/$/, "");
  const payments = superadmin
    ? { ...(await getPaymentSettingsView()), webhookUrl: `${origin}/api/payments/xendly/webhook` }
    : null;
  const [queue] = superadmin
    ? await db
        .select({
          pending: sql<number>`count(*) filter (where ${pushNotifications.sentAt} is null and ${pushNotifications.cancelledAt} is null)::int`,
          failed: sql<number>`count(*) filter (where ${pushNotifications.lastError} is not null and ${pushNotifications.cancelledAt} is null)::int`,
        })
        .from(pushNotifications)
    : [{ pending: 0, failed: 0 }];
  return (
    <AccountDashboard role="admin">
      <GovernancePanel
        role={viewer.role}
        accounts={accounts}
        bootstrap={viewer.role === "secretary" && supers === 0}
        policy={superadmin ? await getLoanPolicy() : null}
        payments={payments}
        notifications={
          config
            ? {
                appId: config.appId,
                siteUrl: config.siteUrl,
                hasKey: config.hasKey,
                configured: config.configured,
                policy: config.policy,
                ...queue,
              }
            : null
        }
      />
    </AccountDashboard>
  );
}
