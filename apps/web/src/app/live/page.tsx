import Link from "next/link";
import { redirect } from "next/navigation";
import { apiErrorCodeSchema } from "@workspace/core";
import { CopyButton } from "@/components/ui";
import { signOut } from "@/features/auth/actions";
import { rotateInvite } from "@/features/teams/actions";
import { teamErrorMessage } from "@/features/teams/invite";
import { CreateTeamForm, JoinLinkForm } from "@/features/teams/onboarding-forms";
import { callTeams } from "@/features/teams/teams-api";
import styles from "@/features/teams/teams.module.css";
import { appOrigin } from "@/lib/app-origin";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your team" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const client = await createSupabaseServer();
  if (!client) redirect("/login");
  const result = await client.auth.getUser().catch(() => null);
  if (!result?.data.user || result.error) redirect("/login");
  const user = result.data.user;
  const errorCode = apiErrorCodeSchema.safeParse((await searchParams).error);

  const signOutButton = (
    <form action={signOut}>
      <button className="button button-ghost" type="submit">
        Sign out
      </button>
    </form>
  );

  const { data: membership, error: membershipError } = await client
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError)
    return (
      <main className={styles.page}>
        <div className={styles.header}>
          <h1>Your team</h1>
          {signOutButton}
        </div>
        <p className="error-text" role="alert">
          Your team could not be loaded. Please try again.
        </p>
      </main>
    );

  if (!membership)
    return (
      <main className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1>Set up your team</h1>
            <p className={styles.muted}>Signed in as {user.email ?? "your account"}.</p>
          </div>
          {signOutButton}
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

  const isAdmin = membership.role === "admin";
  const [team, repository, members, invite] = await Promise.all([
    client.from("teams").select("name").eq("id", membership.team_id).single(),
    client.from("repositories").select("name").eq("team_id", membership.team_id).limit(1),
    client
      .from("team_members")
      .select("user_id, display_name, role, avatar_url")
      .eq("team_id", membership.team_id)
      .order("joined_at"),
    isAdmin ? callTeams(client, { action: "get_invite", team_id: membership.team_id }) : null,
  ]);
  const inviteLink =
    invite?.ok && invite.data.invite_token
      ? new URL(`/invite/${invite.data.invite_token}`, await appOrigin()).href
      : null;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>{team.data?.name ?? "Your team"}</h1>
          <p className={styles.muted}>{repository.data?.[0]?.name}</p>
        </div>
        {signOutButton}
      </div>

      {errorCode.success && (
        <p className="error-text" role="alert">
          {teamErrorMessage(errorCode.data)}
        </p>
      )}

      <section className={styles.card} aria-labelledby="members-title">
        <h2 id="members-title">Members</h2>
        <ul className={styles.members}>
          {(members.data ?? []).map((member) => (
            <li key={member.user_id}>
              {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- small provider avatar
                <img src={member.avatar_url} alt="" />
              ) : (
                <span className={styles.initials} aria-hidden="true">
                  {member.display_name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>
                {member.display_name}
                {member.user_id === user.id ? " (you)" : ""}
              </span>
              <span className={styles.role}>{member.role}</span>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <section className={styles.card} aria-labelledby="invite-title">
          <h2 id="invite-title">Invite teammates</h2>
          {invite && !invite.ok ? (
            <p className="error-text" role="alert">
              {teamErrorMessage(invite.code)}
            </p>
          ) : inviteLink ? (
            <>
              <div className={styles.inviteRow}>
                <input aria-label="Invite link" value={inviteLink} readOnly />
                <CopyButton value={inviteLink} label="Copy" />
              </div>
              <p className={styles.muted}>
                Anyone with this link can join. A new link turns off the old one.
              </p>
              <form action={rotateInvite.bind(null, membership.team_id)}>
                <button className="button button-secondary" type="submit">
                  Make a new link
                </button>
              </form>
            </>
          ) : (
            <form action={rotateInvite.bind(null, membership.team_id)}>
              <button className="button button-primary" type="submit">
                Create invite link
              </button>
            </form>
          )}
        </section>
      )}

      <Link className="text-link" href="/">
        Open the sample workspace
      </Link>
    </main>
  );
}
