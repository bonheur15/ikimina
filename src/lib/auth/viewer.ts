import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, type Role } from "@/auth";
import { db } from "@/db";
import { members, users } from "@/db/schema";

export type Viewer = {
  id: string; name: string; email: string | null; role: Role;
  member: { id: string; code: string } | null;
};

/** The signed-in user, re-checked against the database on every request so disabled accounts lose access immediately. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [row] = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role, disabledAt: users.disabledAt,
    memberId: members.id, memberCode: members.code,
  }).from(users).leftJoin(members, eq(users.memberId, members.id)).where(eq(users.id, session.user.id)).limit(1);
  if (!row || row.disabledAt) return null;
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    member: row.memberId && row.memberCode ? { id: row.memberId, code: row.memberCode } : null,
  };
});

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") redirect("/member");
  return viewer;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertAdmin() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") throw new Error("Only administrators can do this.");
  return viewer;
}

export const homeFor = (viewer: Viewer) => viewer.role === "admin" ? "/admin" : "/member";
