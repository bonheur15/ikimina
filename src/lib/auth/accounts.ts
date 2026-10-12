import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accountTokens, auditLog, members, users } from "@/db/schema";
import { hashPassword } from "@/auth";

const LINK_LIFETIME_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates (or reuses) the login account for a member and returns a single-use link for choosing a password.
 * Older unused links for the same account stop working.
 */
export async function createAccountLink(memberId: string, adminId: string) {
  const member = await db.query.members.findFirst({ where: eq(members.id, memberId) });
  if (!member) throw new Error("Member not found.");
  return db.transaction(async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(users.memberId, member.id) });
    const actor = await tx.query.users.findFirst({ where: eq(users.id, adminId) });
    if (user && user.role !== "member" && actor?.role !== "superadmin")
      throw new Error("Only superadmin can reset a staff account.");
    if (!user) {
      const email = member.email?.toLowerCase() ?? null;
      const taken = email ? await tx.query.users.findFirst({ where: eq(users.email, email) }) : undefined;
      [user] = await tx
        .insert(users)
        .values({
          name: [member.firstName, member.surname].filter(Boolean).join(" "),
          email: taken ? null : email,
          role: "member",
          memberId: member.id,
        })
        .returning();
    }
    await tx
      .update(accountTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(accountTokens.userId, user.id), isNull(accountTokens.usedAt)));
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_LIFETIME_DAYS * 86400_000);
    await tx
      .insert(accountTokens)
      .values({ userId: user.id, tokenHash: hashToken(token), expiresAt, createdBy: adminId });
    await tx.insert(auditLog).values({
      actorId: adminId,
      action: user.passwordHash ? "account.reset_link" : "account.invite_link",
      entity: "member",
      entityId: member.code,
    });
    return { path: `/set-password?token=${token}`, expiresAt, hasPassword: !!user.passwordHash };
  });
}

export async function findValidToken(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      tokenId: accountTokens.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      memberCode: members.code,
      hasPassword: users.passwordHash,
    })
    .from(accountTokens)
    .innerJoin(users, eq(accountTokens.userId, users.id))
    .leftJoin(members, eq(users.memberId, members.id))
    .where(
      and(
        eq(accountTokens.tokenHash, hashToken(token)),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, new Date()),
        isNull(users.disabledAt),
      ),
    )
    .limit(1);
  return row ? { ...row, hasPassword: !!row.hasPassword } : null;
}

export async function setPasswordWithToken(token: string, password: string) {
  const found = await findValidToken(token);
  if (!found) return false;
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const used = await tx
      .update(accountTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(accountTokens.id, found.tokenId), isNull(accountTokens.usedAt)))
      .returning({ id: accountTokens.id });
    if (!used.length) throw new Error("This link has already been used.");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, found.userId));
    await tx
      .insert(auditLog)
      .values({ actorId: found.userId, action: "account.password_set", entity: "user", entityId: found.userId });
  });
  return true;
}
