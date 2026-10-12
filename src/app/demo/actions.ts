"use server";

import { notFound } from "next/navigation";
import { signIn } from "@/auth";
import { DEMO_ACCOUNTS, demoEnabled } from "@/lib/demo";

/** Signs in as one of the demo accounts. Only available where the demo page is. */
export async function demoSignIn(role: "admin" | "member" | "superadmin" | "manager") {
  if (!demoEnabled()) notFound();
  const account = DEMO_ACCOUNTS[role];
  await signIn("credentials", { identifier: account.email, password: account.password, redirectTo: role === "member" ? "/member" : role === "superadmin" ? "/admin/governance" : role === "manager" ? "/admin/mobile-money" : "/admin" });
}
