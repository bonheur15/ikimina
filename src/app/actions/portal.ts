"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, cashbookEntries, ledgerEntries, members, settings, users } from "@/db/schema";
import { assertAdmin, getViewer } from "@/lib/auth/viewer";
import { createAccountLink } from "@/lib/auth/accounts";
import { toRecord } from "@/lib/portal-server";
import { CASH_CATEGORIES, SHARE_VALUE, type MemberRecord } from "@/lib/portal-data";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Check the form and try again.";

const PREFIX = { savings: "SAV", social: "SOC", penalty: "PEN" } as const;
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a contribution month.");

const contribution = z.object({
  memberId: z.string().min(1, "Search for and select a member first."),
  kind: z.enum(["savings", "social", "penalty"]),
  shares: z.number().int().min(1).max(20000).optional(),
  amount: z.number().positive().max(100_000_000).optional(),
  period,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the payment date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose the payment time."),
  method: z.enum(["Mobile Money", "Bank transfer", "Cash"]),
  note: z.string().trim().max(200).optional(),
});

export async function recordContribution(input: z.input<typeof contribution>): Promise<Result<{ record: MemberRecord }>> {
  const admin = await assertAdmin();
  const parsed = contribution.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const data = parsed.data;
  const amount = data.kind === "savings" ? (data.shares ?? 0) * SHARE_VALUE : Math.round((data.amount ?? 0) * 100) / 100;
  if (!amount) return fail(data.kind === "savings" ? "Enter a whole number of shares between 1 and 20,000." : "Enter an amount between 0.01 and 100,000,000 RWF.");
  if (data.kind === "penalty" && !data.note) return fail("Enter the penalty reason or reference.");
  const paidAt = new Date(`${data.date}T${data.time}:00+02:00`);
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 60_000) return fail("The payment date can’t be in the future.");

  const member = await db.query.members.findFirst({ where: eq(members.code, data.memberId) });
  if (!member) return fail("That member no longer exists.");
  const reference = `${PREFIX[data.kind]}-${data.date.slice(2, 4)}${data.date.slice(5, 7)}-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
  const [row] = await db.insert(ledgerEntries).values({
    reference, memberId: member.id, kind: data.kind, amount, period: data.period, paidAt, method: data.method,
    note: data.note || null, source: "manual", recordedBy: admin.id,
  }).returning();
  await db.insert(auditLog).values({ actorId: admin.id, action: "ledger.create", entity: "ledger_entry", entityId: reference, details: { member: member.code, kind: data.kind, amount } });
  return { ok: true, record: toRecord(row, member.code) };
}

export async function voidRecord(reference: string, reason: string): Promise<Result> {
  const admin = await assertAdmin();
  const why = reason.trim();
  if (why.length < 3) return fail("Explain why this record is being removed.");
  const voided = await db.update(ledgerEntries).set({ voidedAt: new Date(), voidedBy: admin.id, voidReason: why.slice(0, 300) })
    .where(and(eq(ledgerEntries.reference, reference), isNull(ledgerEntries.voidedAt), eq(ledgerEntries.source, "manual"))).returning({ id: ledgerEntries.id });
  if (!voided.length) return fail("Only records entered in the app can be removed. Imported records are corrected in the source workbook.");
  await db.insert(auditLog).values({ actorId: admin.id, action: "ledger.void", entity: "ledger_entry", entityId: reference, details: { reason: why } });
  return { ok: true };
}

const optionalText = (max: number) => z.string().trim().max(max).transform(v => v || null);
const memberDetails = z.object({
  code: z.string().min(1),
  surname: z.string().trim().min(1, "Enter the surname.").max(80),
  firstName: optionalText(80),
  email: z.string().trim().toLowerCase().max(200).refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address.").transform(v => v || null),
  phone: optionalText(60),
  district: optionalText(60),
  monthlyCommitment: z.number().int().min(0).max(100_000_000).nullable(),
  status: z.enum(["active", "former"]),
});

export async function updateMember(input: z.input<typeof memberDetails>): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = memberDetails.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { code, ...data } = parsed.data;
  const member = await db.query.members.findFirst({ where: eq(members.code, code) });
  if (!member) return fail("Member not found.");
  const emailError = await syncLoginEmail(member.id, data.email);
  if (emailError) return fail(emailError);
  await db.update(members).set({ ...data, updatedAt: new Date() }).where(eq(members.id, member.id));
  await db.insert(auditLog).values({ actorId: admin.id, action: "member.update", entity: "member", entityId: code, details: data });
  return { ok: true };
}

/** Members may update their own contact details. */
export async function updateOwnContact(input: { email: string; phone: string }): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer?.member) return fail("Your account isn’t linked to a member profile.");
  const parsed = memberDetails.pick({ email: true, phone: true }).safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const emailError = await syncLoginEmail(viewer.member.id, parsed.data.email);
  if (emailError) return fail(emailError);
  await db.update(members).set({ ...parsed.data, updatedAt: new Date() }).where(eq(members.id, viewer.member.id));
  await db.insert(auditLog).values({ actorId: viewer.id, action: "member.update_contact", entity: "member", entityId: viewer.member.code });
  return { ok: true };
}

/** Keeps the sign-in email in step with the member's email, refusing addresses used by another account. */
async function syncLoginEmail(memberId: string, email: string | null) {
  const user = await db.query.users.findFirst({ where: eq(users.memberId, memberId) });
  if (!user) return null;
  if (email) {
    const other = await db.query.users.findFirst({ where: and(eq(users.email, email), ne(users.id, user.id)) });
    if (other) return "Another account already signs in with that email.";
  }
  await db.update(users).set({ email }).where(eq(users.id, user.id));
  return null;
}

export async function createSignInLink(code: string): Promise<Result<{ url: string; expiresAt: string; reset: boolean }>> {
  const admin = await assertAdmin();
  const member = await db.query.members.findFirst({ where: eq(members.code, code) });
  if (!member) return fail("Member not found.");
  const link = await createAccountLink(member.id, admin.id);
  const h = await headers();
  const origin = process.env.AUTH_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return { ok: true, url: `${origin}${link.path}`, expiresAt: link.expiresAt.toISOString(), reset: link.hasPassword };
}

export async function setAccountDisabled(code: string, disabled: boolean): Promise<Result> {
  const admin = await assertAdmin();
  const member = await db.query.members.findFirst({ where: eq(members.code, code) });
  if (!member) return fail("Member not found.");
  const updated = await db.update(users).set({ disabledAt: disabled ? new Date() : null }).where(eq(users.memberId, member.id)).returning({ id: users.id });
  if (!updated.length) return fail("This member has no account yet.");
  await db.insert(auditLog).values({ actorId: admin.id, action: disabled ? "account.disable" : "account.enable", entity: "member", entityId: code });
  return { ok: true };
}

const groupSettings = z.object({
  groupName: z.string().trim().min(1, "Enter the group name.").max(60, "Use at most 60 characters."),
  socialMonthly: z.number().int("Use a whole amount.").min(1, "Enter the monthly social contribution.").max(10_000_000),
});

export async function updateSettings(input: z.input<typeof groupSettings>): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = groupSettings.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  for (const [key, value] of Object.entries(parsed.data)) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }
  await db.insert(auditLog).values({ actorId: admin.id, action: "settings.update", entity: "settings", details: parsed.data });
  return { ok: true };
}

const cashEntry = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date."),
  description: z.string().trim().min(2, "Describe the entry.").max(200),
  direction: z.enum(["in", "out"]),
  amount: z.number().positive("Enter an amount.").max(100_000_000),
  category: z.enum(CASH_CATEGORIES as [string, ...string[]]),
});

export async function addCashbookEntry(input: z.input<typeof cashEntry>): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = cashEntry.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { direction, amount, date, ...data } = parsed.data;
  await db.transaction(async tx => {
    const [{ last }] = await tx.select({ last: sql<number>`coalesce(max(${cashbookEntries.position}), 0)`.mapWith(Number) }).from(cashbookEntries);
    await tx.insert(cashbookEntries).values({
      ...data, position: last + 1, entryDate: date, dateText: date, moneyIn: direction === "in" ? amount : 0,
      moneyOut: direction === "out" ? amount : 0, source: "manual", recordedBy: admin.id,
    });
  });
  await db.insert(auditLog).values({ actorId: admin.id, action: "cashbook.create", entity: "cashbook", details: parsed.data });
  return { ok: true };
}

export async function categorizeCashEntry(id: string, category: string): Promise<Result> {
  const admin = await assertAdmin();
  if (category && !CASH_CATEGORIES.includes(category)) return fail("Unknown category.");
  const updated = await db.update(cashbookEntries).set({ category: category || null }).where(eq(cashbookEntries.id, id)).returning({ id: cashbookEntries.id });
  if (!updated.length) return fail("Entry not found.");
  await db.insert(auditLog).values({ actorId: admin.id, action: "cashbook.categorize", entity: "cashbook", entityId: id, details: { category } });
  return { ok: true };
}
