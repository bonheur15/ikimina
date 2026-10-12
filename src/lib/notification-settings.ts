import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";

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
function key() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required to protect the OneSignal key.");
  return createHash("sha256").update(`elayo-onesignal:${process.env.AUTH_SECRET}`).digest();
}
export function encryptPushKey(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}
export function decryptPushKey(encrypted: string) {
  const [version, iv, content, tag] = encrypted.split(".");
  if (version !== "v1" || !iv || !content || !tag) throw new Error("Invalid encrypted key.");
  const cipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(content, "base64url")), cipher.final()]).toString("utf8");
}
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
