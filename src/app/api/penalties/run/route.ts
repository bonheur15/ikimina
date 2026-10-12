import { timingSafeEqual } from "node:crypto";
import { runLoanReminders } from "@/lib/loan-notifications";
import { runPenaltyAutomation } from "@/lib/penalty-automation";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Scheduled endpoint is not configured." }, { status: 503 });
  const supplied = request.headers.get("authorization") || "",
    expected = `Bearer ${secret}`;
  if (
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const loans = await runLoanReminders();
  return Response.json({ ...(await runPenaltyAutomation()), loans });
}
