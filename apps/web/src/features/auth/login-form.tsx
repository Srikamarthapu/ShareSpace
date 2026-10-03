"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { safeWorkspaceReturn } from "./return-path";

export function LoginForm({ returnTo = "/live" }: { returnTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const client = createSupabaseBrowser();
      const result =
        mode === "signup"
          ? await client.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: new URL("/auth/callback", window.location.origin).href,
                data: { display_name: String(form.get("name") ?? "").trim() },
              },
            })
          : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(
          result.error.code === "email_not_confirmed"
            ? "Confirm your email before signing in. Open the confirmation link in the email you received."
            : mode === "signup"
              ? "Could not create the account. Check your details or try signing in. If email delivery is rate limited, wait before retrying."
              : "Sign-in failed. Check your email and password and try again.",
        );
      } else if (!result.data.session) {
        setMessage(
          "Check your email to confirm your account. Open the link in this browser, then return to your team invitation if you have one.",
        );
      } else {
        router.replace(safeWorkspaceReturn(returnTo));
        router.refresh();
      }
    } catch {
      setError("Authentication is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div
        className="live-tabs"
        aria-label="Account access"
        style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBlock: 16 }}
      >
        <button
          type="button"
          className={`button ${mode === "signin" ? "button-primary" : "button-secondary"}`}
          aria-pressed={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setError("");
            setMessage("");
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`button ${mode === "signup" ? "button-primary" : "button-secondary"}`}
          aria-pressed={mode === "signup"}
          onClick={() => {
            setMode("signup");
            setError("");
            setMessage("");
          }}
        >
          Create account
        </button>
      </div>
      <form onSubmit={submit} aria-busy={pending}>
        {mode === "signup" && (
          <>
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              name="name"
              required
              minLength={1}
              maxLength={100}
              autoComplete="name"
            />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" name="email" required autoComplete="email" maxLength={254} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          name="password"
          required
          minLength={mode === "signup" ? 8 : 1}
          maxLength={256}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-describedby={mode === "signup" ? "password-help" : undefined}
        />
        {mode === "signup" && (
          <span className="muted small" id="password-help">
            Use at least 8 characters.
          </span>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <button className="button button-primary" disabled={pending} type="submit">
          {pending
            ? "Please wait…"
            : mode === "signup"
              ? "Create your account"
              : "Sign in to workspace"}
        </button>
      </form>
    </>
  );
}
