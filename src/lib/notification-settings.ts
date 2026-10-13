import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { openSecret, sealSecret } from "./secret-box";

export const notificationPolicySchema = z.object({
  enabled: z.boolean(),
  loanUpdates: z.boolean(),
  overdue: z.boolean(),
  dueSoonDays: z.number().int().min(0).max(30),
  repeatDays: z.number().int().min(1).max(30),
  notifyBackers: z.boolean(),
  maxQueueAgeDays: z.number().int().min(1).max(30).default(7),
});
export type NotificationPolicy = z.infer<typeof notificationPolicySchema>;
export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  enabled: true,
  loanUpdates: true,
  overdue: true,
  dueSoonDays: 3,
  repeatDays: 3,
  notifyBackers: false,
  maxQueueAgeDays: 7,
};
export const encryptPushKey = (secret: string) => sealSecret("onesignal", secret);
export const decryptPushKey = (encrypted: string) => openSecret("onesignal", encrypted);
export async function getNotificationPolicy() {
  const [row] = await db.select().from(settings).where(eq(settings.key, "notificationPolicy"));
  return row ? notificationPolicySchema.parse(row.value) : DEFAULT_NOTIFICATION_POLICY;
}
export async function getPushConfig() {
  const [row] = await db.select().from(settings).where(eq(settings.key, "oneSignal"));
  const stored = row?.value as
    { appId?: string; encryptedKey?: string; siteUrl?: string; disabled?: boolean } | undefined;
  let apiKey: string | null = process.env.ONESIGNAL_REST_API_KEY || null;
  if (stored?.encryptedKey) {
    try {
      apiKey = decryptPushKey(stored.encryptedKey);
    } catch {
      apiKey = null;
    }
  }
  const appId = stored?.appId || process.env.ONESIGNAL_APP_ID || "";
  const siteUrl = stored?.siteUrl || process.env.AUTH_URL || "";
  const policy = await getNotificationPolicy();
  return {
    appId,
    apiKey,
    siteUrl,
    policy,
    hasKey: !!(stored?.encryptedKey || process.env.ONESIGNAL_REST_API_KEY),
    configured: !!(appId && apiKey && siteUrl && process.env.AUTH_SECRET && !stored?.disabled),
  };
}
