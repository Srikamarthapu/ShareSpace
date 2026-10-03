"use client";
import { useActionState } from "react";
import { signUp } from "./actions";
export function SignupForm({ returnTo = "/live" }: { returnTo?: string }) {
  const [state, action, pending] = useActionState(signUp, { error: "", notice: "" });
  return (
    <form action={action}>
      <input type="hidden" name="next" value={returnTo} />
      <label htmlFor="signup-name">Name</label>
      <input id="signup-name" name="name" required autoComplete="name" maxLength={100} />
      <label htmlFor="signup-email">Email</label>
      <input
        id="signup-email"
        type="email"
        name="email"
        required
        autoComplete="email"
        maxLength={254}
      />
      <label htmlFor="signup-password">Password</label>
      <input
        id="signup-password"
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        maxLength={256}
      />
      {state.error && (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && <p role="status">{state.notice}</p>}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
