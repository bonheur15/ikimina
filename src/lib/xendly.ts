import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DEFAULT_FEE_BPS } from "./payment-fees";

export function normalizePhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, "");
  const phone = digits.startsWith("0") ? `250${digits.slice(1)}` : digits;
  if (!/^2507[2389]\d{7}$/.test(phone))
    throw new Error("Enter a Rwandan MTN MoMo or Airtel Money number (078, 079, 072 or 073).");
  return phone;
}

export const providerTransaction = z.object({
  id: z.uuid(),
  reference: z.string(),
  direction: z.enum(["collect", "payout"]),
  amount: z.number().int().positive(),
  fee: z.number().int().nonnegative(),
  currency: z.literal("RWF"),
  msisdn: z
    .string()
    .refine((value) => {
      try {
        normalizePhone(value);
        return true;
      } catch {
        return false;
      }
    }, "Invalid wallet number.")
    .transform(normalizePhone),
  mode: z.enum(["test", "live"]),
  status: z.enum(["pending", "succeeded", "failed", "cancelled"]),
  completed_at: z.iso.datetime({ offset: true }).nullable().optional(),
  failure_message: z.string().nullable().optional(),
});
export type ProviderTransaction = z.infer<typeof providerTransaction>;

export function verifySignature(raw: string, header: string | null, secret: string, now = Date.now()) {
  if (!header || !secret) return false;
  const match = /^t=(\d+),v1=([a-fA-F0-9]{64})$/.exec(header);
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${match[1]}.${raw}`).digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}

export type PaymentMode = "test" | "live";
export type PaymentKeys = { apiKey: string; webhookSecret: string };
export type PaymentSettings = { mode: PaymentMode; feeBps: number; keys: Partial<Record<PaymentMode, PaymentKeys>> };

export function checkPaymentMode(mode: string): PaymentMode {
  if (mode !== "test" && mode !== "live") throw new Error("XENDLY_MODE must be test or live.");
  return mode;
}
export function checkFeeBps(feeBps: number) {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000)
    throw new Error("XENDLY_FEE_BPS must be a whole number from 0 to 9999.");
  return feeBps;
}
// Server environment defaults; keys saved by the superadmin take precedence (see payment-settings.ts).
export function envPaymentSettings(): PaymentSettings {
  const mode = checkPaymentMode(process.env.XENDLY_MODE ?? "test");
  const apiKey = process.env.XENDLY_API_KEY,
    webhookSecret = process.env.XENDLY_WEBHOOK_SECRET;
  return {
    mode,
    feeBps: checkFeeBps(Number(process.env.XENDLY_FEE_BPS ?? DEFAULT_FEE_BPS)),
    keys: apiKey && webhookSecret ? { [mode]: { apiKey, webhookSecret } } : {},
  };
}
export function paymentConfig(settings: PaymentSettings) {
  return { mode: settings.mode, configured: Boolean(settings.keys[settings.mode]), feeBps: settings.feeBps } as const;
}

export class ProviderError extends Error {
  definitive: boolean;
  constructor(message: string, definitive = false) {
    super(message);
    this.definitive = definitive;
  }
}

export async function xendlyRequest(apiKey: string | undefined, path: string, body?: object, key?: string) {
  if (!apiKey) throw new ProviderError("Mobile money is not connected yet. Please contact your administrator.");
  let response: Response;
  try {
    response = await fetch(`https://api.xendlypay.com${path}`, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ProviderError(
      "The network did not confirm the request. Check status to safely retry this same transaction.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ProviderError(
      typeof data?.message === "string"
        ? data.message.slice(0, 300)
        : "The payment provider could not process this request.",
      [400, 401, 402, 403, 404, 409, 422].includes(response.status),
    );
  }
  if (data?.success !== true)
    throw new ProviderError("The provider returned an unreadable response. Check status before trying again.");
  return data.payload as unknown;
}
