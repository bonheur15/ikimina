"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import {
  cancelContributionProof,
  ProofError,
  reviewContributionProof,
  submitContributionProof,
} from "@/lib/contribution-proofs";

async function actor() {
  const viewer = await getViewer();
  if (!viewer) throw new ProofError("Sign in to continue.");
  return { id: viewer.id, role: viewer.role, memberId: viewer.member?.id ?? null };
}
async function perform<T>(work: () => Promise<T>) {
  try {
    const value = await work();
    revalidatePath("/member", "layout");
    revalidatePath("/admin", "layout");
    return { ok: true as const, value };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false as const, error: error.issues[0]?.message ?? "Check your payment details." };
    if (error instanceof ProofError) return { ok: false as const, error: error.message };
    console.error("Contribution receipt operation failed", error);
    return {
      ok: false as const,
      error: "Could not complete this operation. Check your receipt activity before trying again.",
    };
  }
}
export async function uploadContributionReceipt(form: FormData) {
  return perform(async () => {
    const viewer = await actor();
    if (!(form instanceof FormData)) throw new ProofError("Use the receipt upload form.");
    const file = form.get("receipt");
    if (!(file instanceof File)) throw new ProofError("Attach your payment receipt.");
    return submitContributionProof(
      viewer,
      {
        id: form.get("id"),
        kind: form.get("kind"),
        amount: Number(form.get("amount")),
        period: form.get("period"),
        paidOn: form.get("paidOn"),
        method: form.get("method"),
        paymentReference: form.get("paymentReference"),
        note: form.get("note"),
      },
      file,
    );
  });
}
export async function reviewReceipt(input: { id: string; approve: boolean; note: string }) {
  return perform(async () => reviewContributionProof(await actor(), input));
}
export async function cancelReceipt(id: string) {
  return perform(async () => cancelContributionProof(await actor(), id));
}
