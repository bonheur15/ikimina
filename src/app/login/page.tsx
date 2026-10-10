import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/lib/auth/viewer";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Elayo Family" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect(homeFor(viewer));
  const { next, reset } = await searchParams;
  return <AuthShell title="Welcome back" subtitle="Sign in to see your savings, contributions and statements.">
    {reset === "1" && <p className="form-success" role="status">Your password is set. You can sign in now.</p>}
    <LoginForm next={typeof next === "string" ? next : ""} />
    <p className="auth-help">No password yet? Ask your group administrator for your personal sign-in link.</p>
  </AuthShell>;
}
