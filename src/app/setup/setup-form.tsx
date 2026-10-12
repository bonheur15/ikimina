"use client";

import { BrandLoader } from "@/components/brand-loader";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { createFirstAdmin } from "./actions";

export function SetupForm({ needsCode }: { needsCode: boolean }) {
  const [state, action, pending] = useActionState(createFirstAdmin, {});
  return (
    <form action={action} className="portal-form auth-form">
      <label className="field">
        Your name
        <input name="name" autoComplete="name" required autoFocus />
      </label>
      <label className="field">
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="field">
        Password
        <input name="password" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="field">
        Confirm password
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {needsCode && (
        <label className="field">
          Setup code
          <input name="code" autoComplete="off" required />
        </label>
      )}
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <button type="submit" className="action" disabled={pending} aria-busy={pending}>
        {pending ? <BrandLoader size="inline" /> : <Check size={16} />}Create superadmin
      </button>
    </form>
  );
}
