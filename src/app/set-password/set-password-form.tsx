"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { choosePassword } from "./actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(choosePassword, {});
  return <form action={action} className="portal-form auth-form">
    <input type="hidden" name="token" value={token} />
    <label className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus /></label>
    <label className="field">Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    <button type="submit" className="action" disabled={pending}><Check size={16} />Save password</button>
  </form>;
}
