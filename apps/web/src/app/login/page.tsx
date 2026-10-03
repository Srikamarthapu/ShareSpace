import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { SignupForm } from "@/features/auth/signup-form";
import { GithubLogin } from "@/features/auth/github-login";
import { githubAvailability } from "@/features/auth/availability";
import { loginErrorMessage } from "@/features/auth/callback";
import { safeWorkspaceReturn } from "@/features/auth/return-path";
import { createSupabaseServer } from "@/lib/supabase/server";
export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeWorkspaceReturn(params.next);
  const client = await createSupabaseServer();
  const user = client ? await client.auth.getUser().catch(() => null) : null;
  if (user?.data.user) redirect(returnTo);
  const availability = client ? await githubAvailability() : "disabled";
  const error = loginErrorMessage(params.error);
  return (
    <main className="login-panel">
      <Link href="/" className="brand">
        ShareSpace
      </Link>
      <h1>Sign in to ShareSpace</h1>
      <p>Your team’s shared context, in one place.</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {client ? (
        <>
          <GithubLogin availability={availability} returnTo={returnTo} />
          <details className="section-spacing">
            <summary>Sign in with email</summary>
            <LoginForm returnTo={returnTo} />
          </details>
          <details className="section-spacing">
            <summary>Create an account with email</summary>
            <SignupForm returnTo={returnTo} />
          </details>
        </>
      ) : (
        <div className="setup-panel">
          <h2>Sign-in is not configured</h2>
          <p>
            The project administrator needs to connect Supabase before accounts are available.
          </p>
        </div>
      )}
      <p className="muted small section-spacing">
        Signing in does not share your repository or agent sessions. You choose what to share after
        setup.
      </p>
      <Link href="/" className="text-link">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to workspace
      </Link>
    </main>
  );
}
