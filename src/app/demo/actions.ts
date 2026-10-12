"use server";

import { notFound } from "next/navigation";
import { signIn } from "@/auth";
import { DEMO_ACCOUNTS, demoEnabled } from "@/lib/demo";

/** Signs in as one of the demo accounts. Only available where the demo page is. */
export async function demoSignIn(role: "admin" | "member") {
  if (!demoEnabled()) notFound();
  const account = DEMO_ACCOUNTS[role];
  await signIn("credentials", { identifier: account.email, password: account.password, redirectTo: role === "admin" ? "/admin" : "/member" });
}
