import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  envPaymentSettings,
  normalizePhone,
  paymentConfig,
  providerTransaction,
  ProviderError,
  verifySignature,
  xendlyRequest,
} from "../src/lib/xendly";

test("wallet normalization accepts MTN and Airtel formats and rejects other numbers", () => {
  for (const value of ["0788924941", "250788924941", "+250 788 924 941"])
    assert.equal(normalizePhone(value), "250788924941");
  for (const prefix of ["072", "073", "079"]) assert.match(normalizePhone(`${prefix}1234567`), /^2507/);
  for (const value of ["0711234567", "078123", "+254788924941", "078abc4567"])
    assert.throws(() => normalizePhone(value));
});

test("webhook signatures validate raw bytes, require freshness and reject malformed signatures", () => {
  const raw = '{"type":"ping","data":{}}',
    secret = "test-signing-secret",
    now = 1_791_827_400_000,
    timestamp = String(now / 1000);
  const signature = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  assert.equal(verifySignature(raw, signature, secret, now), true);
  assert.equal(verifySignature(`${raw}\n`, signature, secret, now), false);
  assert.equal(verifySignature(raw, signature, "different", now), false);
  assert.equal(verifySignature(raw, signature, secret, now + 301_000), false);
  assert.equal(verifySignature(raw, signature, secret, now - 301_000), false);
  for (const header of [null, "t=12,v1=bad", `t=bad,v1=${"a".repeat(64)}`])
    assert.equal(verifySignature(raw, header, secret, now), false);
});

test("provider schema rejects fractional currency and invalid phone data without throwing from safeParse", () => {
  const payment = {
    id: "0f8c2b7e-1a45-4c31-9d02-6e8f1b2c3d44",
    reference: "reference",
    direction: "collect",
    amount: 5000,
    fee: 125,
    currency: "RWF",
    msisdn: "0788924941",
    mode: "live",
    status: "pending",
  };
  assert.equal(providerTransaction.parse(payment).msisdn, "250788924941");
  for (const change of [
    { amount: 0 },
    { amount: 1.1 },
    { fee: -1 },
    { currency: "USD" },
    { mode: "other" },
    { msisdn: "invalid" },
  ])
    assert.equal(providerTransaction.safeParse({ ...payment, ...change }).success, false);
});

test("provider client retains idempotency keys and separates definite refusal from unknown outcome", async () => {
  const previous = {
    fetch: globalThis.fetch,
    key: process.env.XENDLY_API_KEY,
    secret: process.env.XENDLY_WEBHOOK_SECRET,
    mode: process.env.XENDLY_MODE,
  };
  process.env.XENDLY_API_KEY = "fixture-key";
  process.env.XENDLY_WEBHOOK_SECRET = "fixture-secret";
  process.env.XENDLY_MODE = "test";
  try {
    assert.deepEqual(paymentConfig(envPaymentSettings()), { configured: true, mode: "test", feeBps: 250 });
    assert.deepEqual(paymentConfig({ mode: "live", feeBps: 300, keys: envPaymentSettings().keys }), {
      configured: false,
      mode: "live",
      feeBps: 300,
    });
    await assert.rejects(xendlyRequest(undefined, "/v1/payments"), ProviderError);
    const seen: string[] = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.xendlypay.com/v1/payments");
      assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer fixture-key");
      seen.push(new Headers(options?.headers).get("Idempotency-Key")!);
      return Response.json({ success: true, payload: { id: "fixture" } });
    };
    await xendlyRequest("fixture-key", "/v1/payments", { amount: 100 }, "same-reference");
    await xendlyRequest("fixture-key", "/v1/payments", { amount: 100 }, "same-reference");
    assert.deepEqual(seen, ["same-reference", "same-reference"]);
    for (const [status, definitive] of [
      [403, true],
      [409, true],
      [429, false],
      [500, false],
    ] as const) {
      globalThis.fetch = async () => Response.json({ message: "Refused" }, { status });
      await assert.rejects(
        xendlyRequest("fixture-key", "/v1/payments", {}, "same-reference"),
        (error) => error instanceof ProviderError && error.definitive === definitive,
      );
    }
    globalThis.fetch = async () => {
      throw new Error("Network timeout");
    };
    await assert.rejects(
      xendlyRequest("fixture-key", "/v1/payments", {}, "same-reference"),
      (error) => error instanceof ProviderError && !error.definitive,
    );
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({
      XENDLY_API_KEY: previous.key,
      XENDLY_WEBHOOK_SECRET: previous.secret,
      XENDLY_MODE: previous.mode,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
