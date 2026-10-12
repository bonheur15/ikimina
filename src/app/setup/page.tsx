import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/auth-shell";
import { needsSetup } from "@/lib/auth/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up — Elayo Family" };

export default async function SetupPage() {
  // Always check the database at request time, never at build time.
  await connection();
  if (!(await needsSetup())) redirect("/login");
  return <AuthShell title="Set up your workspace" subtitle="Create the first administrator account. This page closes as soon as it exists.">
    <SetupForm needsCode={!!process.env.SETUP_TOKEN} />
  </AuthShell>;
}
