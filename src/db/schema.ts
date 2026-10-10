import { boolean, char, customType, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { CellStyle, SheetSnapshot } from "@/lib/xlsx/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", ["admin", "member"]);
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
  memberId: uuid("member_id").unique().references(() => members.id, { onDelete: "set null" }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Single-use links for setting a password (account invitations and resets). Only a hash of the token is stored. */
export const accountTokens = pgTable("account_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

export const workbookSheets = pgTable("workbook_sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workbookId: uuid("workbook_id").notNull().references(() => workbooks.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  rowCount: integer("row_count").notNull(),
  colCount: integer("col_count").notNull(),
  data: jsonb("data").$type<SheetSnapshot>().notNull(),
}, t => [uniqueIndex("workbook_sheets_position").on(t.workbookId, t.position)]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  reference: varchar("reference", { length: 40 }).notNull().unique(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
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
  createdAt: createdAt(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
  voidReason: text("void_reason"),
}, t => [index("ledger_member").on(t.memberId), index("ledger_kind_period").on(t.kind, t.period)]);

export const cashbookEntries = pgTable("cashbook_entries", {
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
}, t => [index("cashbook_position").on(t.position)]);

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

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: createdAt(),
}, t => [index("audit_created").on(t.createdAt)]);

export type ImportSummary = {
  counts: Record<string, number>;
  /** Items that need a human decision; nothing here was silently corrected. */
  findings: { sheet: string; ref?: string; message: string }[];
};

export type MemberRow = typeof members.$inferSelect;
export type LedgerRow = typeof ledgerEntries.$inferSelect;
export type CashbookRow = typeof cashbookEntries.$inferSelect;
