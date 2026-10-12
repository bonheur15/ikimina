import { sql } from "drizzle-orm";
import type { db } from "@/db";
export type FinanceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Short DB transactions only: never hold this lock across a provider request. */
export async function lockFinance(tx: FinanceTx) {
  await tx.execute(sql`select pg_advisory_xact_lock(831730)`);
}
