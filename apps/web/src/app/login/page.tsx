import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/features/auth/login-form";
import { SignupForm } from "@/features/auth/signup-form";
import { GithubLogin } from "@/features/auth/github-login";
import { githubAvailability } from "@/features/auth/availability";
import { loginErrorMessage } from "@/features/auth/callback";
import { supabaseConfig } from "@/lib/supabase/config";
export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = !!supabaseConfig();
  const availability = configured ? await githubAvailability() : "disabled";
  const error = loginErrorMessage((await searchParams).error);
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
      {configured ? (
        <>
          <GithubLogin availability={availability} />
          <details className="section-spacing">
            <summary>Sign in with email</summary>
            <LoginForm />
          </details>
          <details className="section-spacing">
            <summary>Create an account with email</summary>
            <SignupForm />
          </details>
        </>
      ) : (
        <div className="setup-panel">
          <h2>Sign-in is not configured</h2>
          <p>
            The project administrator needs to connect Supabase before real accounts are available.
            You can explore the sample workspace in the meantime.
          </p>
        </div>
      )}
      <p className="muted small section-spacing">
        Signing in does not share your repository or agent sessions. You choose what to share after
        setup.
      </p>
      <Link href="/" className="text-link">
        <ArrowLeft size={14} aria-hidden="true" />
        Explore the sample workspace
      </Link>
    </main>
  );
}
