"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { ProviderAvailability } from "./availability";
import { safeWorkspaceReturn } from "./return-path";

export function GithubLogin({
  availability,
  returnTo = "/live",
}: {
  availability: ProviderAvailability;
  returnTo?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setError("");
    setPending(true);
    try {
      const client = createSupabaseBrowser();
      const callback = new URL("/auth/callback", window.location.origin);
      const next = safeWorkspaceReturn(returnTo);
      if (next !== "/live") callback.searchParams.set("next", next);
      const { error } = await client.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: callback.href,
        },
      });
      if (error) throw error;
    } catch {
      setError(
        "GitHub sign-in could not start. Please try again or use an existing email account.",
      );
      setPending(false);
    }
  }
  return (
    <div className="auth-provider">
      <button
        className="button button-primary"
        type="button"
        disabled={pending || availability === "disabled"}
        onClick={signIn}
      >
        <ArrowUpRight size={17} aria-hidden="true" />
        {pending ? "Opening GitHub…" : "Continue with GitHub"}
      </button>
      {availability === "disabled" && (
        <p className="muted small">
          GitHub sign-in is not enabled for this workspace yet. Your project administrator needs to
          finish the provider setup.
        </p>
      )}
      {availability === "unknown" && (
        <p className="muted small">
          We couldn’t check GitHub availability. You can still try signing in.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
