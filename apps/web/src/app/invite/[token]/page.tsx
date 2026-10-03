import Link from "next/link";
import { apiErrorCodeSchema } from "@workspace/core";
import { acceptInvite, signInToJoin } from "@/features/teams/actions";
import { inviteTokenFromInput, teamErrorMessage } from "@/features/teams/invite";
import { callTeams } from "@/features/teams/teams-api";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a team" };

function Panel({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="login-panel">
      <Link href="/" className="brand">
        ShareSpace
      </Link>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token: rawToken } = await params;
  const token = inviteTokenFromInput(rawToken);
  const errorCode = apiErrorCodeSchema.safeParse((await searchParams).error);
  if (!token || token !== rawToken)
    return (
      <Panel title="This invite link doesn’t work">
        <p>Check the link or ask your team admin for a new one.</p>
      </Panel>
    );

  const client = await createSupabaseServer();
  if (!client)
    return (
      <Panel title="Sign-in is not configured">
        <p>Supabase must be connected before you can join a team.</p>
      </Panel>
    );

  const [userResult, preview] = await Promise.all([
    client.auth.getUser().catch(() => null),
    callTeams(client, { action: "preview_invite", token }),
  ]);
  const signedIn = Boolean(userResult?.data.user);

  if (!preview.ok)
    return (
      <Panel title="We couldn’t check this invite">
        <p>Please try again in a moment.</p>
      </Panel>
    );
  if (preview.data.state === "rotated")
    return (
      <Panel title="This invite link was replaced">
        <p>Ask your team admin for the new link.</p>
      </Panel>
    );
  if (preview.data.state === "invalid")
    return (
      <Panel title="This invite link doesn’t work">
        <p>Check the link or ask your team admin for a new one.</p>
      </Panel>
    );

  return (
    <Panel title={`Join ${preview.data.team_name ?? "this team"}`}>
      <p>
        You’ll see your teammates’ shared sessions. Your own sharing stays off until you turn it on.
      </p>
      {errorCode.success && (
        <p className="error-text" role="alert">
          {teamErrorMessage(errorCode.data)}
        </p>
      )}
      {signedIn ? (
        <form action={acceptInvite.bind(null, token)}>
          <button className="button button-primary" type="submit">
            Join team
          </button>
        </form>
      ) : (
        <form action={signInToJoin.bind(null, token)}>
          <button className="button button-primary" type="submit">
            Sign in to join
          </button>
          <p className="muted small">New here? You can create an account on the next page.</p>
        </form>
      )}
    </Panel>
  );
}
