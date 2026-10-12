"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/viewer";
import { importStoredWorkbooks, storeWorkbook } from "@/lib/import/workbook-import";
import { parseWorkbook } from "@/lib/xlsx/parse";

const MAX_BYTES = 5 * 1024 * 1024;

/** True while the database has no members yet (a fresh installation). */
export async function hasNoRecords() {
  const [{ count }] = await db.execute(sql`select count(*)::int as count from members`) as unknown as { count: number }[];
  return Number(count) === 0;
}

/**
 * Loads the group's two source workbooks into an empty database. Only available on a fresh installation:
 * once members exist, records are managed in the app and this refuses to run.
 */
export async function importInitialRecords(_state: { error?: string; done?: string }, form: FormData): Promise<{ error?: string; done?: string }> {
  const admin = await assertAdmin();
  if (!(await hasNoRecords())) return { error: "Records are already loaded." };
  const files = [form.get("savings"), form.get("roster")];
  for (const file of files) {
    if (!(file instanceof File) || !file.size) return { error: "Choose both Excel files." };
    if (!/\.xlsx$/i.test(file.name)) return { error: "Only .xlsx files are supported." };
    if (file.size > MAX_BYTES) return { error: "Each file must be smaller than 5 MB." };
  }
  try {
    const [savingsId, rosterId] = await Promise.all((files as File[]).map(async file => {
      const data = Buffer.from(await file.arrayBuffer());
      return storeWorkbook(db, { fileName: file.name, title: file.name.replace(/\.xlsx$/i, ""), data }, await parseWorkbook(data), admin.id);
    }));
    const { summary } = await importStoredWorkbooks(db, savingsId, rosterId);
    await db.insert(auditLog).values({ actorId: admin.id, action: "records.initial_import", entity: "workbook", entityId: savingsId, details: { counts: summary.counts } });
    const records = (summary.counts.savings ?? 0) + (summary.counts.social ?? 0) + (summary.counts.penalty ?? 0) + (summary.counts.interest ?? 0) + (summary.counts.adjustment ?? 0);
    return { done: `Loaded ${summary.counts.activeMembers ?? 0} members and ${records.toLocaleString("en-US")} records. ${summary.findings.length} differences are listed in Reports → Import review.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The files couldn’t be imported." };
  }
}
