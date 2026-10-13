import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { findValidToken } from "@/lib/auth/accounts";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose your password — Elayo Family" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const { token } = await searchParams;
  const found = typeof token === "string" ? await findValidToken(token) : null;
  if (!found)
    return (
      <AuthShell title="This link has expired" subtitle="Sign-in links work once and expire after 7 days.">
        <p className="auth-help">Ask your group administrator for a new link.</p>
        <Link className="action secondary" href="/login">
          Go to sign in
        </Link>
      </AuthShell>
    );
  return (
    <AuthShell
      title={found.hasPassword ? "Choose a new password" : `Welcome, ${found.name.split(" ")[0]}`}
      subtitle="Choose a password for your Elayo Family account."
    >
      <dl className="detail-list auth-identity">
        <div>
          <dt>Name</dt>
          <dd>{found.name}</dd>
        </div>
        {found.memberCode && (
          <div>
            <dt>Member code</dt>
            <dd className="mono">{found.memberCode}</dd>
          </div>
        )}
        {found.email && (
          <div>
            <dt>Email</dt>
            <dd>{found.email}</dd>
          </div>
        )}
      </dl>
      <SetPasswordForm token={token as string} />
      <p className="auth-help">
        You’ll sign in with {found.email ? "your email or " : ""}your member code and this password.
      </p>
    </AuthShell>
  );
}
