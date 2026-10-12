import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** True until the first administrator account exists. */
export async function needsSetup() {
  return (await db.$count(users, eq(users.role, "admin"))) === 0;
}
