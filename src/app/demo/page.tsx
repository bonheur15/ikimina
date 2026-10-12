import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { getViewer } from "@/lib/auth/viewer";
import { DEMO_ACCOUNTS, demoEnabled, ensureDemoAccounts } from "@/lib/demo";
import { DemoAccounts } from "./demo-accounts";

export const metadata: Metadata = { title: "Demo accounts — Elayo Family", robots: { index: false } };

export default async function DemoPage() {
  await connection();
  if (!demoEnabled()) notFound();
  const [linked, viewer] = await Promise.all([ensureDemoAccounts(), getViewer()]);
  return (
    <AuthShell
      title="Demo accounts"
      subtitle="Test accounts for local development. Click to sign in, or copy the details."
    >
      {viewer && (
        <p className="form-success" role="status">
          Signed in as {viewer.name} ({viewer.role}). Choosing an account below switches to it.
        </p>
      )}
      <DemoAccounts
        accounts={[
          {
            role: "superadmin",
            title: "Superadmin",
            detail: "Configures loan rules, staff access and notifications",
            identifier: DEMO_ACCOUNTS.superadmin.email,
            password: DEMO_ACCOUNTS.superadmin.password,
          },
          {
            role: "manager",
            title: "Manager",
            detail: "Reads group reports and approves loans",
            identifier: DEMO_ACCOUNTS.manager.email,
            password: DEMO_ACCOUNTS.manager.password,
          },
          {
            role: "admin",
            title: "Secretary",
            detail: "Manages members, records and reports",
            identifier: DEMO_ACCOUNTS.admin.email,
            password: DEMO_ACCOUNTS.admin.password,
          },
          ...(linked
            ? [
                {
                  role: "member" as const,
                  title: "Member",
                  detail: `${linked.memberName} · ${linked.memberCode}`,
                  identifier: DEMO_ACCOUNTS.member.email,
                  altIdentifier: linked.memberCode,
                  password: DEMO_ACCOUNTS.member.password,
                },
              ]
            : []),
        ]}
      />
      {!linked && (
        <p className="auth-help">The member account appears once members are imported (Workbooks → Import records).</p>
      )}
      <p className="auth-help">
        This page is only available in development. In production it returns 404 unless <code>ENABLE_DEMO=true</code> is
        set.
      </p>
    </AuthShell>
  );
}
