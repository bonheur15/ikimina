import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** True until the first administrator account exists. */
export async function needsSetup() {
  return (await db.$count(users, inArray(users.role, ["secretary", "manager", "superadmin"]))) === 0;
}
