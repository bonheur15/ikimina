"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return <form action={action} className="portal-form auth-form">
    <input type="hidden" name="next" value={next} />
    <label className="field">Email or member code
      <input name="identifier" autoComplete="username" required defaultValue={state.identifier} placeholder="name@example.com or CEAD0001" autoFocus />
    </label>
    <label className="field">Password
      <input name="password" type="password" autoComplete="current-password" required />
    </label>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    <button type="submit" className="action" disabled={pending}>
      {pending ? <LoaderCircle size={17} className="spin" /> : null}Sign in{!pending && <ArrowRight size={16} />}
    </button>
  </form>;
}
