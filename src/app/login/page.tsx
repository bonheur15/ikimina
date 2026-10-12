import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/lib/auth/viewer";
import { AuthShell } from "@/components/auth-shell";
import { needsSetup } from "@/lib/auth/setup";
import { demoEnabled } from "@/lib/demo";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Elayo Family" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const viewer = await getViewer();
  if (viewer) redirect(homeFor(viewer));
  if (await needsSetup()) redirect("/setup");
  const { next, reset, setup } = await searchParams;
  return (
    <AuthShell
      variant="community"
      title="Welcome back"
      subtitle="Sign in to see your savings, contributions and statements."
    >
      {reset === "1" && (
        <p className="form-success" role="status">
          Your password is set. You can sign in now.
        </p>
      )}
      {setup === "1" && (
        <p className="form-success" role="status">
          Your administrator account is ready. Sign in to continue.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : ""} />
      <p className="auth-help">No password yet? Ask your group administrator for your personal sign-in link.</p>
      {demoEnabled() && (
        <p className="auth-help">
          Testing locally?{" "}
          <Link className="positive" href="/demo">
            Use a demo account
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
