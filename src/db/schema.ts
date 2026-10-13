import {
  boolean,
  char,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CellStyle, SheetSnapshot } from "@/lib/xlsx/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", ["superadmin", "secretary", "manager", "member"]);
/** `former` members appear in historical registers but not in the current member roster. */
export const memberStatus = pgEnum("member_status", ["active", "former"]);
/** Signed amounts: savings, social, penalty and interest are positive; adjustments may be negative (e.g. withdrawals). */
export const entryKind = pgEnum("entry_kind", ["savings", "social", "penalty", "interest", "adjustment"]);
export const recordSource = pgEnum("record_source", ["import", "manual"]);

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  surname: text("surname").notNull(),
  firstName: text("first_name"),
  email: text("email"),
  phone: text("phone"),
  district: text("district"),
  nationalId: text("national_id"),
  status: memberStatus("status").notNull().default("active"),
  rosterNumber: integer("roster_number"),
  /** Expected monthly savings in RWF, used for participation tracking. */
  monthlyCommitment: integer("monthly_commitment"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Lower-cased. Members without an email sign in with their member code. */
  email: text("email").unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: userRole("role").notNull().default("member"),
  memberId: uuid("member_id")
    .unique()
    .references(() => members.id, { onDelete: "set null" }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Single-use links for setting a password (account invitations and resets). Only a hash of the token is stored. */
export const accountTokens = pgTable("account_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const workbooks = pgTable("workbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  sha256: char("sha256", { length: 64 }).notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  file: bytea("file").notNull(),
  styles: jsonb("styles").$type<CellStyle[]>().notNull(),
  defaultFont: jsonb("default_font").$type<{ name: string; size: number }>().notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const workbookSheets = pgTable(
  "workbook_sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workbookId: uuid("workbook_id")
      .notNull()
      .references(() => workbooks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    rowCount: integer("row_count").notNull(),
    colCount: integer("col_count").notNull(),
    data: jsonb("data").$type<SheetSnapshot>().notNull(),
  },
  (t) => [uniqueIndex("workbook_sheets_position").on(t.workbookId, t.position)],
);

/** Freeze the agreed shares for a savings window, so later changes do not rewrite its fines. */
export const savingsPenaltyCycles = pgTable(
  "savings_penalty_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    period: char("period", { length: 7 }).notNull(),
    expectedShares: integer("expected_shares").notNull(),
    basis: text("basis").$type<"unpaid" | "committed">().notNull().default("unpaid"),
    processedThrough: date("processed_through"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("savings_penalty_cycle_member_period").on(t.memberId, t.period)],
);

export const penaltyDelayRequests = pgTable(
  "penalty_delay_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    period: char("period", { length: 7 }).notNull(),
    reason: text("reason").notNull(),
    requestedUntil: date("requested_until").notNull(),
    status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
    deferredUntil: date("deferred_until"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("penalty_delay_member_period").on(t.memberId, t.period)],
);

/** A member's request for a different monthly share count. Only the secretary changes shares. */
export const shareChangeRequests = pgTable(
  "share_change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    currentShares: integer("current_shares").notNull(),
    requestedShares: integer("requested_shares").notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<"pending" | "approved" | "rejected" | "cancelled">().notNull().default("pending"),
    /** First savings month the approved shares apply to, chosen by the secretary. */
    effectivePeriod: char("effective_period", { length: 7 }),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("share_change_request_member").on(t.memberId),
    uniqueIndex("share_change_request_pending")
      .on(t.memberId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/** Monthly shares from a savings month onward; the latest row at or before a month is that month's target. */
export const memberSharePlans = pgTable(
  "member_share_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    effectivePeriod: char("effective_period", { length: 7 }).notNull(),
    shares: integer("shares").notNull(),
    requestId: uuid("request_id").references(() => shareChangeRequests.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("member_share_plan_period").on(t.memberId, t.effectivePeriod)],
);

export const pushNotifications = pgTable("push_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventKey: text("event_key").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  path: text("path").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

/** A fine assessed to a member. It is not income until a linked payment is recorded. */
export const penaltyAssessments = pgTable(
  "penalty_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    period: char("period", { length: 7 }).notNull(),
    assessedOn: date("assessed_on").notNull(),
    reason: text("reason").notNull(),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id").references(() => savingsPenaltyCycles.id, { onDelete: "restrict" }),
    chargeOn: date("charge_on"),
    chargedShares: integer("charged_shares"),
    createdAt: createdAt(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    index("penalty_assessment_member").on(t.memberId),
    index("penalty_assessment_period").on(t.period),
    uniqueIndex("penalty_cycle_day").on(t.cycleId, t.chargeOn),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    kind: entryKind("kind").notNull(),
    amount: money("amount").notNull(),
    /** Month the contribution applies to (YYYY-MM). Null when the source does not say. */
    period: char("period", { length: 7 }),
    /** Actual payment time, when known. Imported monthly registers only know the period. */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    method: text("method"),
    note: text("note"),
    source: recordSource("source").notNull().default("manual"),
    /** Workbook cell for imported records, e.g. "Saving!G4". */
    sourceRef: text("source_ref"),
    /** Member name as written in the source row, kept when it differs from the roster. */
    sourceName: text("source_name"),
    workbookId: uuid("workbook_id").references(() => workbooks.id, { onDelete: "set null" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    penaltyAssessmentId: uuid("penalty_assessment_id").references(() => penaltyAssessments.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    index("ledger_member").on(t.memberId),
    index("ledger_kind_period").on(t.kind, t.period),
    index("ledger_penalty_assessment").on(t.penaltyAssessmentId),
  ],
);

export const cashbookEntries = pgTable(
  "cashbook_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Order in the book; running balances follow this order, not the date. */
    position: integer("position").notNull(),
    entryDate: date("entry_date"),
    /** Date exactly as written in the source. */
    dateText: text("date_text"),
    /** True when the year was not written and was taken from the previous entry. */
    dateInferred: boolean("date_inferred").notNull().default(false),
    description: text("description").notNull(),
    moneyIn: money("money_in").notNull().default(0),
    moneyOut: money("money_out").notNull().default(0),
    /** Running balance shown in the source workbook, for comparison. */
    sourceBalance: money("source_balance"),
    category: text("category"),
    comment: text("comment"),
    source: recordSource("source").notNull().default("manual"),
    sourceRef: text("source_ref"),
    workbookId: uuid("workbook_id").references(() => workbooks.id, { onDelete: "set null" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (t) => [index("cashbook_position").on(t.position)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workbookId: uuid("workbook_id").references(() => workbooks.id, { onDelete: "set null" }),
  summary: jsonb("summary").$type<ImportSummary>().notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created").on(t.createdAt)],
);

/** Requests are reviewed before money can leave the group's wallet. Loan terms are agreed per request. */
export const financeRequests = pgTable(
  "finance_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"loan" | "withdrawal">().notNull(),
    processingFeeAmount: integer("processing_fee_amount").notNull().default(0),
    processingFeeSource: text("processing_fee_source")
      .$type<"mobile_money" | "savings" | "mixed">()
      .notNull()
      .default("mobile_money"),
    processingFeeDeductedAmount: integer("processing_fee_deducted_amount").notNull().default(0),
    processingFeePaidAt: timestamp("processing_fee_paid_at", { withTimezone: true }),
    loanType: text("loan_type").$type<"savings" | "backed">(),
    loanTerms: jsonb("loan_terms").$type<import("@/lib/loan-policy").LoanTerms>(),
    amount: integer("amount").notNull(),
    /** New requests include the member's payout fee in the reserved savings / financed principal. */
    payoutAmount: integer("payout_amount"),
    quotedFee: integer("quoted_fee").notNull().default(0),
    feePolicy: text("fee_policy").$type<"group" | "member">().notNull().default("group"),
    msisdn: text("msisdn").notNull(),
    reason: text("reason").notNull(),
    status: text("status")
      .$type<"requested" | "approved" | "rejected" | "cancelled" | "paid">()
      .notNull()
      .default("requested"),
    interestAmount: integer("interest_amount"),
    repaymentMonths: integer("repayment_months"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("finance_request_member").on(t.memberId)],
);

export const loanBackings = pgTable(
  "loan_backings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => financeRequests.id, { onDelete: "restrict" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    status: text("status").$type<"pending" | "approved" | "declined">().notNull().default("pending"),
    isBorrower: boolean("is_borrower").notNull().default(false),
    mode: text("mode").$type<"lock" | "deduct">().notNull(),
    releasedAmount: integer("released_amount").notNull().default(0),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    fundedAt: timestamp("funded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("loan_backing_member_request").on(t.requestId, t.memberId),
    index("loan_backing_member").on(t.memberId),
  ],
);

/** Persisted before contacting the provider; the id is also the permanent idempotency key. */
export const mobilePayments = pgTable(
  "mobile_payments",
  {
    id: uuid("id").primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").references(() => financeRequests.id),
    purpose: text("purpose")
      .$type<"savings" | "social" | "penalty" | "loan_repayment" | "loan_fee" | "loan" | "withdrawal">()
      .notNull(),
    direction: text("direction").$type<"collect" | "payout">().notNull(),
    amount: integer("amount").notNull(),
    accountAmount: integer("account_amount"),
    appliedAmount: integer("applied_amount"),
    quotedFee: integer("quoted_fee").notNull().default(0),
    feePolicy: text("fee_policy").$type<"group" | "member">().notNull().default("group"),
    fee: integer("fee").notNull().default(0),
    msisdn: text("msisdn").notNull(),
    period: char("period", { length: 7 }),
    description: text("description").notNull(),
    mode: text("mode").$type<"test" | "live">().notNull(),
    status: text("status")
      .$type<"created" | "pending" | "succeeded" | "failed" | "cancelled">()
      .notNull()
      .default("created"),
    providerId: uuid("provider_id").unique(),
    failureMessage: text("failure_message"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("mobile_payment_member").on(t.memberId), index("mobile_payment_request").on(t.requestId)],
);

export const paymentDeliveries = pgTable("payment_deliveries", {
  id: text("id").primaryKey(),
  createdAt: createdAt(),
});

/** Offline payments are credited only after the secretary verifies the private receipt. */
export const contributionProofs = pgTable(
  "contribution_proofs",
  {
    id: uuid("id").primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"savings" | "social">().notNull(),
    amount: integer("amount").notNull(),
    period: char("period", { length: 7 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    method: text("method").$type<"Mobile Money" | "Bank transfer" | "Cash">().notNull(),
    paymentReference: text("payment_reference"),
    note: text("note"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    file: bytea("file").notNull(),
    status: text("status").$type<"pending" | "approved" | "rejected" | "cancelled">().notNull().default("pending"),
    ledgerEntryId: uuid("ledger_entry_id")
      .unique()
      .references(() => ledgerEntries.id, { onDelete: "restrict" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("contribution_proof_member").on(t.memberId),
    index("contribution_proof_status").on(t.status),
    uniqueIndex("contribution_proof_active_file")
      .on(t.sha256)
      .where(sql`${t.status} in ('pending', 'approved')`),
    uniqueIndex("contribution_proof_active_reference")
      .on(t.method, t.paymentReference)
      .where(sql`${t.status} in ('pending', 'approved') and ${t.paymentReference} is not null`),
  ],
);

export type ImportSummary = {
  counts: Record<string, number>;
  /** Items that need a human decision; nothing here was silently corrected. */
  findings: { sheet: string; ref?: string; message: string }[];
};

export type MemberRow = typeof members.$inferSelect;
export type LedgerRow = typeof ledgerEntries.$inferSelect;
export type CashbookRow = typeof cashbookEntries.$inferSelect;
