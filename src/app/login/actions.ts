"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error?: string; identifier?: string };

export async function login(_state: LoginState, form: FormData): Promise<LoginState> {
  const identifier = String(form.get("identifier") ?? "").trim();
  const next = String(form.get("next") ?? "");
  try {
    await signIn("credentials", {
      identifier, password: String(form.get("password") ?? ""),
      // Only same-site paths are allowed as a destination after signing in.
      redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      const limited = "code" in error && error.code === "rate_limited";
      return { identifier, error: limited ? "Too many attempts. Wait 15 minutes and try again." : "That email or member code and password don’t match." };
    }
    throw error;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
