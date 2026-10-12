import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contributionProofs } from "@/db/schema";
import { getViewer } from "@/lib/auth/viewer";
import { canAccessContributionProof } from "@/lib/contribution-proofs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in to view receipts.", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const [metadata] = await db.select({ memberId: contributionProofs.memberId }).from(contributionProofs).where(eq(contributionProofs.id, id));
  if (!metadata || !canAccessContributionProof({ id: viewer.id, role: viewer.role, memberId: viewer.member?.id ?? null }, metadata.memberId)) return new Response("Not found", { status: 404 });
  const [receipt] = await db.select({ file: contributionProofs.file, mimeType: contributionProofs.mimeType, fileName: contributionProofs.fileName }).from(contributionProofs).where(eq(contributionProofs.id, id));
  return new Response(new Uint8Array(receipt.file), { headers: {
    "Content-Type": receipt.mimeType, "Content-Length": String(receipt.file.length),
    "Content-Disposition": `${receipt.mimeType === "application/pdf" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(receipt.fileName)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer",
  } });
}
