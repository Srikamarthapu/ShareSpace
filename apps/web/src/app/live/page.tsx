import { redirect } from "next/navigation";
import { signOut } from "@/features/auth/actions";
import { LiveWorkspace } from "@/features/live/workspace";
import { inviteTokenFromInput } from "@/features/teams/invite";
import { CreateTeamForm, JoinLinkForm } from "@/features/teams/onboarding-forms";
import styles from "@/features/teams/teams.module.css";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clean = Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const client = await createSupabaseServer();
  const result = client ? await client.auth.getUser().catch(() => null) : null;
  if (!client || !result?.data.user || result.error) {
    const query = new URLSearchParams(clean).toString();
    const returnTo = `/live${query ? `?${query}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  const user = result.data.user;
  const { data: membership, error } = await client
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error)
    return (
      <main className={styles.page}>
        <h1>Your workspace could not be loaded</h1>
        <p className="error-text" role="alert">
          Please try again in a moment.
        </p>
      </main>
    );

  if (!membership) {
    const invite = inviteTokenFromInput(clean.invite ?? "");
    if (invite) redirect(`/invite/${invite}`);

    return (
      <main className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1>Set up your team</h1>
            <p className={styles.muted}>Signed in as {user.email ?? "your account"}.</p>
          </div>
          <form action={signOut}>
            <button className="button button-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
        <section className={styles.card} aria-labelledby="create-team-title">
          <h2 id="create-team-title">Create a team</h2>
          <CreateTeamForm />
        </section>
        <p className={styles.or}>or</p>
        <section className={styles.card} aria-labelledby="join-team-title">
          <h2 id="join-team-title">Join a team</h2>
          <JoinLinkForm />
        </section>
      </main>
    );
  }

  return (
    <LiveWorkspace
      key={`${user.id}:${clean.repository ?? ""}:${clean.session ?? ""}`}
      user={{ id: user.id, email: user.email ?? "Signed-in member" }}
      query={clean}
    />
  );
}
