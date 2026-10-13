import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { openSecret, sealSecret } from "./secret-box";
import {
  checkFeeBps,
  envPaymentSettings,
  paymentConfig,
  type PaymentKeys,
  type PaymentMode,
  type PaymentSettings,
} from "./xendly";

export const PAYMENT_SETTING = "xendly";
export const PAYMENT_MODES = ["test", "live"] as const;
export type StoredPaymentKeys = { encryptedKey: string | null; encryptedSecret: string | null };
export type StoredPaymentSettings = {
  mode?: PaymentMode;
  feeBps?: number;
  test?: StoredPaymentKeys;
  live?: StoredPaymentKeys;
  disabled?: boolean;
};
export type KeySource = "dashboard" | "environment" | null;

export const sealPaymentSecret = (secret: string) => sealSecret("xendly", secret);
function open(sealed: string | null | undefined) {
  if (!sealed) return null;
  try {
    return openSecret("xendly", sealed);
  } catch {
    return null;
  }
}

export async function getStoredPaymentSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.key, PAYMENT_SETTING));
  return (row?.value ?? {}) as StoredPaymentSettings;
}

async function resolve() {
  const env = envPaymentSettings(),
    stored = await getStoredPaymentSettings();
  const resolved: PaymentSettings = {
    mode: stored.mode ?? env.mode,
    feeBps: stored.feeBps === undefined ? env.feeBps : checkFeeBps(stored.feeBps),
    keys: {},
  };
  const slots = {} as Record<
    PaymentMode,
    { source: KeySource; hasKey: boolean; hasSecret: boolean; unreadable: boolean }
  >;
  for (const mode of PAYMENT_MODES) {
    const saved = stored[mode];
    // A mode with keys saved from the dashboard never mixes them with the server environment's keys.
    if (saved?.encryptedKey || saved?.encryptedSecret) {
      const apiKey = open(saved.encryptedKey),
        webhookSecret = open(saved.encryptedSecret);
      if (apiKey && webhookSecret && !stored.disabled) resolved.keys[mode] = { apiKey, webhookSecret };
      slots[mode] = {
        source: "dashboard",
        hasKey: !!saved.encryptedKey,
        hasSecret: !!saved.encryptedSecret,
        unreadable: (!!saved.encryptedKey && !apiKey) || (!!saved.encryptedSecret && !webhookSecret),
      };
    } else {
      const keys = env.keys[mode];
      if (keys && !stored.disabled) resolved.keys[mode] = keys;
      slots[mode] = { source: keys ? "environment" : null, hasKey: !!keys, hasSecret: !!keys, unreadable: false };
    }
  }
  return { resolved, slots, disabled: !!stored.disabled };
}

/** Mode, fee and the active XendlyPay keys for each mode (saved by superadmin, else the server environment). */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  return (await resolve()).resolved;
}
export async function getPaymentConfig() {
  return paymentConfig(await getPaymentSettings());
}
export async function paymentKeysFor(mode: PaymentMode): Promise<PaymentKeys | undefined> {
  return (await getPaymentSettings()).keys[mode];
}
/** Never includes key material: safe to pass to the governance form. */
export async function getPaymentSettingsView() {
  const { resolved, slots, disabled } = await resolve();
  return { ...paymentConfig(resolved), disabled, slots };
}
