import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { members, users } from "@/db/schema";

export type { Role } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface User {
    role?: Role;
    memberCode?: string | null;
  }
  interface Session {
    user: { id: string; role: Role; memberCode: string | null } & DefaultSession["user"];
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    memberCode?: string | null;
  }
}

const credentials = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

// Slows down password guessing: at most 8 failed attempts per identifier every 15 minutes.
const failures = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60 * 1000;
const tooManyAttempts = (key: string) => {
  const entry = failures.get(key);
  return !!entry && entry.until > Date.now() && entry.count >= 8;
};
const recordFailure = (key: string) => {
  const entry = failures.get(key);
  const fresh = !entry || entry.until < Date.now();
  failures.set(key, { count: fresh ? 1 : entry.count + 1, until: fresh ? Date.now() + WINDOW : entry.until });
};

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

// A constant hash so unknown accounts take as long to reject as wrong passwords.
const DUMMY_HASH = "$2b$12$jgm803P8EPK1oC7sqKeoee2H1BJ8GOV2voezqPdZGU6qaeeRREOG6";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { identifier: { label: "Email or member code" }, password: { label: "Password", type: "password" } },
      async authorize(input) {
        const parsed = credentials.safeParse(input);
        if (!parsed.success) return null;
        const identifier = parsed.data.identifier.toLowerCase();
        if (tooManyAttempts(identifier)) throw new TooManyAttempts();

        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            passwordHash: users.passwordHash,
            disabledAt: users.disabledAt,
            memberCode: members.code,
          })
          .from(users)
          .leftJoin(members, eq(users.memberId, members.id))
          .where(identifier.includes("@") ? eq(users.email, identifier) : eq(members.code, identifier.toUpperCase()))
          .limit(1);

        const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.passwordHash || user.disabledAt || !valid) {
          recordFailure(identifier);
          return null;
        }
        failures.delete(identifier);
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return { id: user.id, name: user.name, email: user.email, role: user.role, memberCode: user.memberCode };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.memberCode = user.memberCode ?? null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid ?? "";
      session.user.role = token.role ?? "member";
      session.user.memberCode = token.memberCode ?? null;
      return session;
    },
  },
});

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
