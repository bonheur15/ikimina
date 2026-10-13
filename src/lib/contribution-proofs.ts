import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  cashbookEntries,
  contributionProofs,
  ledgerEntries,
  members,
  pushNotifications,
  users,
} from "@/db/schema";
import { lockFinance, type FinanceTx } from "./finance-lock";
import { canApproveContributions, canReadGroup, type Role } from "./permissions";
import { kigaliToday } from "./portal-data";
import { assertSavingsAllowed, ShareError } from "./share-plans";

export class ProofError extends Error {}
export type ProofActor = { id: string; role: Role; memberId: string | null };
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const inputSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["savings", "social"]),
  amount: z.number().int().min(100).max(100000000),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a contribution month."),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the payment date."),
  method: z.enum(["Mobile Money", "Bank transfer", "Cash"]),
  paymentReference: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v.replace(/\s+/g, "").toUpperCase() || null),
  note: z.string().trim().max(300),
});
export function receiptType(bytes: Buffer, claimedType: string) {
  const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.subarray(0, 5).toString() === "%PDF-"
        ? "application/pdf"
        : null;
  if (!type || (claimedType && claimedType !== type)) throw new ProofError("Upload a JPG, PNG or PDF receipt.");
  return type;
}
async function notify(tx: FinanceTx, userId: string, eventKey: string, title: string, body: string, path: string) {
  await tx
    .insert(pushNotifications)
    .values({ userId, eventKey: `${eventKey}:${userId}`, title, body, path })
    .onConflictDoNothing();
}
export async function submitContributionProof(actor: ProofActor, input: unknown, file: File) {
  if (!actor.memberId) throw new ProofError("Sign in with a linked member account.");
  const data = inputSchema.parse(input);
  if (data.method !== "Cash" && (!data.paymentReference || data.paymentReference.length < 3))
    throw new ProofError("Enter the transaction reference from your receipt.");
  const paidAt = new Date(`${data.paidOn}T00:00:00+02:00`);
  if (!Number.isFinite(paidAt.getTime()) || kigaliToday(paidAt) !== data.paidOn || data.paidOn > kigaliToday())
    throw new ProofError("Use a valid payment date that is not in the future.");
  if (!(file instanceof File) || !file.size || file.size > MAX_RECEIPT_BYTES)
    throw new ProofError("Choose a receipt up to 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer()),
    mimeType = receiptType(bytes, file.type);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileName =
    file.name
      .split(/[\\/]/)
      .at(-1)!
      .replace(/[\x00-\x1f\x7f]/g, "")
      .slice(0, 150) || "receipt";
  return db.transaction(async (tx) => {
    await lockFinance(tx);
    const [member] = await tx.select().from(members).where(eq(members.id, actor.memberId!)).for("update");
    if (!member || member.status !== "active")
      throw new ProofError("Only active members can submit contribution receipts.");
    const [existing] = await tx.select().from(contributionProofs).where(eq(contributionProofs.id, data.id));
    if (existing) {
      if (
        existing.memberId !== actor.memberId ||
        existing.sha256 !== sha256 ||
        existing.kind !== data.kind ||
        existing.amount !== data.amount ||
        existing.period !== data.period ||
        existing.paidAt.getTime() !== paidAt.getTime() ||
        existing.method !== data.method ||
        existing.paymentReference !== data.paymentReference ||
        (existing.note ?? "") !== data.note
      )
        throw new ProofError("This submission reference belongs to different payment details. Start a new submission.");
      return { id: existing.id };
    }
    const [duplicate] = await tx
      .select({ id: contributionProofs.id })
      .from(contributionProofs)
      .where(
        and(
          inArray(contributionProofs.status, ["pending", "approved"]),
          or(
            eq(contributionProofs.sha256, sha256),
            data.paymentReference
              ? and(
                  eq(contributionProofs.method, data.method),
                  eq(contributionProofs.paymentReference, data.paymentReference),
                )
              : undefined,
          ),
        ),
      );
    if (duplicate)
      throw new ProofError(
        "This receipt or transaction reference has already been submitted. Check your activity before submitting again.",
      );
    if (data.kind === "savings")
      await assertSavingsAllowed(tx, member.id, data.period, data.amount).catch((error) => {
        throw error instanceof ShareError ? new ProofError(error.message) : error;
      });
    await tx.insert(contributionProofs).values({
      id: data.id,
      kind: data.kind,
      amount: data.amount,
      period: data.period,
      method: data.method,
      paymentReference: data.paymentReference,
      note: data.note,
      paidAt,
      memberId: actor.memberId!,
      submittedBy: actor.id,
      fileName,
      mimeType,
      sizeBytes: bytes.length,
      sha256,
      file: bytes,
    });
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "contribution_proof.submit",
      entity: "contribution_proof",
      entityId: data.id,
      details: { kind: data.kind, amount: data.amount, period: data.period, sha256 },
    });
    const secretaries = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "secretary"), isNull(users.disabledAt)));
    for (const secretary of secretaries)
      await notify(
        tx,
        secretary.id,
        `proof-submitted:${data.id}`,
        "Contribution receipt to review",
        `${member.code} submitted a payment receipt. Verify it before crediting the contribution.`,
        "/admin/mobile-money",
      );
    return { id: data.id };
  });
}
export async function reviewContributionProof(actor: ProofActor, input: unknown) {
  if (!canApproveContributions(actor.role))
    throw new ProofError("Only the secretary can approve or decline contribution receipts.");
  const data = z
    .object({ id: z.uuid(), approve: z.boolean(), note: z.string().trim().min(3, "Add a review note.").max(500) })
    .parse(input);
  return db.transaction(async (tx) => {
    await lockFinance(tx);
    const [proof] = await tx.select().from(contributionProofs).where(eq(contributionProofs.id, data.id)).for("update");
    if (!proof) throw new ProofError("Receipt submission not found.");
    const target = data.approve ? "approved" : "rejected";
    if (proof.status === target) return; // An approval replay cannot credit the member twice.
    if (proof.status !== "pending") throw new ProofError("This receipt has already been reviewed or cancelled.");
    const [member] = await tx.select().from(members).where(eq(members.id, proof.memberId)).for("update");
    if (data.approve && member.status !== "active")
      throw new ProofError(
        "This member is no longer active. Decline the receipt or reactivate the member before approval.",
      );
    let ledgerEntryId: string | null = null;
    if (data.approve) {
      const reference = `CP-${proof.id.replaceAll("-", "")}`;
      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          reference,
          memberId: proof.memberId,
          kind: proof.kind,
          amount: proof.amount,
          period: proof.period,
          paidAt: proof.paidAt,
          method: proof.method,
          source: "manual",
          sourceRef: `contribution-proof:${proof.id}`,
          recordedBy: actor.id,
          note: [
            proof.note,
            proof.paymentReference ? `Transaction: ${proof.paymentReference}` : null,
            "Payment receipt verified by secretary",
          ]
            .filter(Boolean)
            .join(" · "),
        })
        .returning({ id: ledgerEntries.id });
      ledgerEntryId = entry.id;
      await tx.execute(sql`select pg_advisory_xact_lock(831729)`);
      const [{ last }] = await tx
        .select({ last: sql<number>`coalesce(max(${cashbookEntries.position}), 0)`.mapWith(Number) })
        .from(cashbookEntries);
      await tx.insert(cashbookEntries).values({
        position: last + 1,
        entryDate: kigaliToday(proof.paidAt),
        dateText: kigaliToday(proof.paidAt),
        description: `${member.code} · ${proof.kind} contribution · verified receipt`,
        moneyIn: proof.amount,
        category: proof.kind === "savings" ? "Savings" : "Social fund",
        source: "manual",
        sourceRef: `contribution-proof:${proof.id}`,
        recordedBy: actor.id,
        comment: proof.paymentReference,
      });
    }
    await tx
      .update(contributionProofs)
      .set({ status: target, ledgerEntryId, reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: data.note })
      .where(eq(contributionProofs.id, proof.id));
    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: `contribution_proof.${target}`,
      entity: "contribution_proof",
      entityId: proof.id,
      details: { amount: proof.amount, ledgerEntryId, note: data.note },
    });
    const recipients = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.memberId, proof.memberId), isNull(users.disabledAt)));
    for (const recipient of recipients)
      await notify(
        tx,
        recipient.id,
        `proof-reviewed:${proof.id}`,
        data.approve ? "Contribution approved" : "Contribution receipt declined",
        data.approve
          ? "Your payment receipt was verified and your contribution has been recorded."
          : "Open your receipt submission to read the secretary’s reason and submit a corrected receipt.",
        "/member?view=money",
      );
  });
}
export async function cancelContributionProof(actor: ProofActor, id: string) {
  z.uuid().parse(id);
  await db.transaction(async (tx) => {
    await lockFinance(tx);
    const [proof] = await tx.select().from(contributionProofs).where(eq(contributionProofs.id, id)).for("update");
    if (!proof || proof.memberId !== actor.memberId) throw new ProofError("Receipt submission not found.");
    if (proof.status === "cancelled") return;
    if (proof.status !== "pending") throw new ProofError("Only a pending receipt can be cancelled.");
    await tx.update(contributionProofs).set({ status: "cancelled" }).where(eq(contributionProofs.id, id));
    await tx
      .insert(auditLog)
      .values({ actorId: actor.id, action: "contribution_proof.cancel", entity: "contribution_proof", entityId: id });
  });
}
export function canAccessContributionProof(actor: ProofActor, memberId: string) {
  return actor.memberId === memberId || canReadGroup(actor.role);
}
export async function loadContributionProofs(memberId?: string) {
  const rows = await db
    .select({
      id: contributionProofs.id,
      memberId: contributionProofs.memberId,
      memberCode: members.code,
      memberName: sql<string>`concat_ws(' ', ${members.firstName}, ${members.surname})`,
      kind: contributionProofs.kind,
      amount: contributionProofs.amount,
      period: contributionProofs.period,
      paidAt: contributionProofs.paidAt,
      method: contributionProofs.method,
      paymentReference: contributionProofs.paymentReference,
      note: contributionProofs.note,
      fileName: contributionProofs.fileName,
      mimeType: contributionProofs.mimeType,
      sizeBytes: contributionProofs.sizeBytes,
      status: contributionProofs.status,
      reviewNote: contributionProofs.reviewNote,
      reviewedAt: contributionProofs.reviewedAt,
      createdAt: contributionProofs.createdAt,
    })
    .from(contributionProofs)
    .innerJoin(members, eq(members.id, contributionProofs.memberId))
    .where(memberId ? eq(contributionProofs.memberId, memberId) : undefined)
    .orderBy(
      sql`case when ${contributionProofs.status} = 'pending' then 0 else 1 end`,
      desc(contributionProofs.createdAt),
    )
    .limit(100);
  return rows.map((r) => ({
    ...r,
    paidAt: r.paidAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
export type ContributionProofData = Awaited<ReturnType<typeof loadContributionProofs>>;
