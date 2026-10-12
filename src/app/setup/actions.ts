"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { hashPassword } from "@/auth";

const form = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
    password: z.string().min(10, "Use at least 10 characters.").max(200),
    confirm: z.string(),
    code: z.string().optional(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don’t match.", path: ["confirm"] });

const sameCode = (given: string, expected: string) =>
  given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/** Creates the first administrator. Refuses once any administrator exists. */
export async function createFirstAdmin(_state: { error?: string }, data: FormData): Promise<{ error?: string }> {
  const parsed = form.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const expected = process.env.SETUP_TOKEN;
  if (expected && !sameCode(parsed.data.code ?? "", expected)) return { error: "The setup code is not correct." };
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await db.transaction(async (tx) => {
    // Serialises concurrent setup attempts so only one administrator can be created this way.
    await tx.execute(sql`select pg_advisory_xact_lock(724501)`);
    if (await tx.$count(users, inArray(users.role, ["secretary", "manager", "superadmin"]))) return false;
    const [admin] = await tx
      .insert(users)
      .values({ name: parsed.data.name, email: parsed.data.email, role: "superadmin", passwordHash })
      .returning({ id: users.id });
    await tx
      .insert(auditLog)
      .values({ actorId: admin.id, action: "setup.first_admin", entity: "user", entityId: admin.id });
    return true;
  });
  if (!created) return { error: "Setup is already complete. Sign in instead." };
  redirect("/login?setup=1");
}
