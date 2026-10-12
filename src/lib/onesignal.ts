import "server-only";
import { createHmac } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { financeRequests, pushNotifications, users } from "@/db/schema";
import { getPushConfig } from "./notification-settings";
import { getLoanBalance } from "./loan-service";

export async function pushConfigured() {
  return (await getPushConfig()).configured;
}
/** Opaque identifiers avoid exposing another member's push identity to the browser. */
export function pushIdentity(userId: string) {
  if (!process.env.AUTH_SECRET) throw new Error("Push identity requires AUTH_SECRET.");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`elayo-push:${userId}`).digest("hex");
}
export async function flushPushNotifications(forceRetry = false) {
  const config = await getPushConfig();
  if (!config.configured || !config.policy.enabled) return { sent: 0, configured: config.configured };
  let sent = 0;
  // OneSignal receives the persisted row UUID as its idempotency key on every retry.
  const pending = await db
    .select()
    .from(pushNotifications)
    .where(
      and(
        isNull(pushNotifications.sentAt),
        isNull(pushNotifications.cancelledAt),
        forceRetry
          ? undefined
          : or(
              isNull(pushNotifications.attemptedAt),
              lt(pushNotifications.attemptedAt, new Date(Date.now() - 15 * 60_000)),
            ),
      ),
    )
    .limit(50);
  for (const item of pending) {
    const [account] = await db.select().from(users).where(eq(users.id, item.userId));
    let stale =
      !account ||
      !!account.disabledAt ||
      item.createdAt.getTime() < Date.now() - config.policy.maxQueueAgeDays * 86400000;
    if (item.eventKey.startsWith("loan-reminder:")) {
      const [loan] = await db
        .select()
        .from(financeRequests)
        .where(eq(financeRequests.id, item.eventKey.split(":")[1]));
      const balance = loan ? await getLoanBalance(db, loan) : null;
      stale ||= !balance || balance.outstanding <= 0;
      if (item.eventKey.includes(":overdue:")) stale ||= !config.policy.overdue || !balance?.overdueDays;
    } else if (item.eventKey.startsWith("loan-") && !config.policy.loanUpdates) continue;
    if (stale) {
      await db
        .update(pushNotifications)
        .set({ cancelledAt: new Date(), lastError: null })
        .where(eq(pushNotifications.id, item.id));
      continue;
    }
    await db.update(pushNotifications).set({ attemptedAt: new Date() }).where(eq(pushNotifications.id, item.id));
    try {
      const response = await fetch("https://api.onesignal.com/notifications?c=push", {
        method: "POST",
        headers: { Authorization: `Key ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: config.appId,
          include_aliases: { external_id: [pushIdentity(item.userId)] },
          target_channel: "push",
          headings: { en: item.title },
          contents: { en: item.body },
          url: new URL(item.path, config.siteUrl).toString(),
          idempotency_key: item.id,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await response.json()) as { id?: string; errors?: unknown };
      if (!response.ok || !result.id)
        throw new Error(`OneSignal did not create the notification (HTTP ${response.status}).`);
      await db
        .update(pushNotifications)
        .set({ sentAt: new Date(), lastError: null })
        .where(eq(pushNotifications.id, item.id));
      sent++;
    } catch (error) {
      await db
        .update(pushNotifications)
        .set({ lastError: error instanceof Error ? error.message.slice(0, 200) : "Push delivery failed." })
        .where(eq(pushNotifications.id, item.id));
    }
  }
  return { sent, configured: true };
}
