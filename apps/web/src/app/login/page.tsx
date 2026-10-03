import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { GithubLogin } from "@/features/auth/github-login";
import { githubAvailability } from "@/features/auth/availability";
import { loginErrorMessage } from "@/features/auth/callback";
import { safeWorkspaceReturn } from "@/features/auth/return-path";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <div className="standalone-appearance">
        <ThemeToggle />
      </div>
      <Link href="/" className="brand">
        ShareSpace
      </Link>
      <h1>Build with shared context.</h1>
      <p>Sign in or create your account to join your team.</p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {client ? (
        <>
          <LoginForm returnTo={returnTo} />
          {availability !== "disabled" && (
            <div className="section-spacing">
              <GithubLogin availability={availability} />
            </div>
          )}
        </>
      ) : (
        <div className="setup-panel">
          <h2>Sign-in is not configured</h2>
          <p>The project administrator needs to connect Supabase before accounts are available.</p>
        </div>
      )}
      <p className="muted small section-spacing">
        Signing in does not share repository content. You choose when to share after connecting your
        agent.
      </p>
    </main>
  );
}
