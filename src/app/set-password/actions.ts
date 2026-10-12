"use server";

import { redirect } from "next/navigation";
import { setPasswordWithToken } from "@/lib/auth/accounts";

export async function choosePassword(_state: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password.length > 200) return { error: "Use at most 200 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don’t match." };
  const ok = await setPasswordWithToken(String(form.get("token") ?? ""), password).catch(() => false);
  if (!ok) return { error: "This link has expired or was already used. Ask your administrator for a new one." };
  redirect("/login?reset=1");
}
