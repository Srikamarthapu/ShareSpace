"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ returnTo = "/live" }: { returnTo?: string }) {
  const [state, action, pending] = useActionState(signIn, { error: "" });
  return (
    <form action={action}>
      <input type="hidden" name="next" value={returnTo} />
      <label htmlFor="email">Email</label>
      <input id="email" type="email" name="email" required autoComplete="email" maxLength={254} />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        name="password"
        required
        autoComplete="current-password"
        maxLength={256}
      />
      {state.error && (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      )}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
