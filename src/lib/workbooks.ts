import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { importRuns } from "@/db/schema";

/** The most recent workbook import and the differences it reported. */
export async function latestImportSummary() {
  const [run] = await db.select().from(importRuns).orderBy(desc(importRuns.createdAt)).limit(1);
  return run ?? null;
}
