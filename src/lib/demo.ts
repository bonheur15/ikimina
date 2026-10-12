import "server-only";
import bcrypt from "bcryptjs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { members, users } from "@/db/schema";
import { hashPassword } from "@/auth";

// Fixed test accounts for local development. Never enabled in production unless ENABLE_DEMO=true.
export const DEMO_ACCOUNTS = {
  admin: { email: "demo-admin@elayo.local", password: "demo-admin-1234", name: "Demo Administrator" },
  member: { email: "demo-member@elayo.local", password: "demo-member-1234" },
} as const;

export const demoEnabled = () => process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "true";

/** Creates the demo accounts if needed and makes sure their passwords still work. */
async function ensureUser(email: string, password: string, values: { name: string; role: "admin" | "member"; memberId?: string }) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!existing) {
    await db.insert(users).values({ email, ...values, passwordHash: await hashPassword(password) });
    return;
  }
  const valid = !!existing.passwordHash && await bcrypt.compare(password, existing.passwordHash);
  if (!valid || existing.disabledAt || existing.role !== values.role) {
    await db.update(users).set({ role: values.role, disabledAt: null, ...(valid ? {} : { passwordHash: await hashPassword(password) }) }).where(eq(users.id, existing.id));
  }
}

export async function ensureDemoAccounts() {
  const { admin, member } = DEMO_ACCOUNTS;
  await ensureUser(admin.email, admin.password, { name: admin.name, role: "admin" });

  // The demo member is linked to a real member record (the first current member without an account),
  // so it shows imported data. Returns null until members have been imported.
  const linked = await db.select({ code: members.code, firstName: members.firstName, surname: members.surname })
    .from(users).innerJoin(members, eq(users.memberId, members.id)).where(eq(users.email, member.email)).limit(1);
  if (linked[0]) {
    const name = [linked[0].firstName, linked[0].surname].filter(Boolean).join(" ");
    await ensureUser(member.email, member.password, { name, role: "member" });
    return { memberCode: linked[0].code, memberName: name };
  }
  const [free] = await db.select({ id: members.id, code: members.code, firstName: members.firstName, surname: members.surname })
    .from(members).leftJoin(users, eq(users.memberId, members.id))
    .where(and(eq(members.status, "active"), isNull(users.id))).orderBy(asc(members.rosterNumber), asc(members.code)).limit(1);
  if (!free) return null;
  const name = [free.firstName, free.surname].filter(Boolean).join(" ");
  const existing = await db.query.users.findFirst({ where: eq(users.email, member.email) });
  if (existing) await db.update(users).set({ memberId: free.id, role: "member", disabledAt: null }).where(eq(users.id, existing.id));
  await ensureUser(member.email, member.password, { name, role: "member", memberId: free.id });
  return { memberCode: free.code, memberName: name };
}
