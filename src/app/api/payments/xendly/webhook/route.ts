import { z } from "zod";
import { db } from "@/db";
import { mobilePayments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { settlePayment } from "@/lib/mobile-money";
import { providerTransaction, verifySignature } from "@/lib/xendly";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.XENDLY_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 65_536) return Response.json({ error: "Body too large." }, { status: 413 });
  if (!verifySignature(raw, request.headers.get("x-xendly-signature"), secret))
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  const envelope = z.object({ type: z.string(), data: z.unknown() }).safeParse(
    (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })(),
  );
  if (!envelope.success) return Response.json({ error: "Invalid event." }, { status: 400 });
  const types: Record<string, { direction: string; status: string }> = {
    "payment.succeeded": { direction: "collect", status: "succeeded" },
    "payment.failed": { direction: "collect", status: "failed" },
    "payout.succeeded": { direction: "payout", status: "succeeded" },
    "payout.failed": { direction: "payout", status: "failed" },
  };
  const expected = types[envelope.data.type];
  if (!expected) return Response.json({ received: true });
  const parsed = providerTransaction.safeParse(envelope.data.data);
  if (!parsed.success || parsed.data.direction !== expected.direction || parsed.data.status !== expected.status)
    return Response.json({ error: "Invalid transaction." }, { status: 400 });
  const deliveryId = request.headers.get("x-xendly-delivery");
  if (!deliveryId || deliveryId.length > 200) return Response.json({ error: "Missing delivery id." }, { status: 400 });
  try {
    // Dashboard payments and other integrations on the same app do not belong to this ledger.
    if (!z.uuid().safeParse(parsed.data.reference).success) return Response.json({ received: true });
    const [known] = await db
      .select({ id: mobilePayments.id })
      .from(mobilePayments)
      .where(eq(mobilePayments.id, parsed.data.reference));
    if (!known) return Response.json({ received: true });
    await settlePayment(parsed.data, deliveryId);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Xendly webhook processing failed", error);
    return Response.json({ error: "Could not record event. Retry delivery." }, { status: 500 });
  }
}
