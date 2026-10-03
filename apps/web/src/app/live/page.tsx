import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { signOut } from "@/features/auth/actions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your workspace" };
export default async function Page() {
  const client = await createSupabaseServer();
  if (!client) redirect("/login");
  const result = await client.auth.getUser().catch(() => null);
  if (!result?.data.user || result.error) redirect("/login");
  const user = result.data.user;
  const resultProjects = await client.from("projects").select("id, name").order("created_at");
  return (
    <main className="standalone-page">
      <Link href="/live" className="brand">
        ShareSpace
      </Link>
      <div className="page-heading">
        <div>
          <h1>Your workspace</h1>
          <p>Signed in as {user.email ?? "a ShareSpace member"}.</p>
        </div>
        <form action={signOut}>
          <button className="button button-secondary" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <section className="setup-panel">
        <h2>
          {resultProjects.error
            ? "Workspace setup is not available yet"
            : "Team setup is being connected"}
        </h2>
        <p>
          Your account is authenticated. Team setup, invitations, device approval, and shared
          history are waiting for the workspace service.
        </p>
        <p className="muted small">
          No repository or agent sessions have been shared by signing in.
        </p>
        {resultProjects.data?.length ? (
          <ul>
            {resultProjects.data.map((project) => (
              <li key={project.id}>{project.name}</li>
            ))}
          </ul>
        ) : null}
        <Link className="button button-secondary" href="/setup">
          Try setup in the sample workspace
        </Link>
      </section>
      <div className="section-spacing">
        <h2>What’s next</h2>
        <ol className="gate-list">
          <li>Create your team and link one repository.</li>
          <li>Invite your teammate.</li>
          <li>Review and approve an agent connection.</li>
          <li>Choose which sessions to share.</li>
        </ol>
        <p className="muted small">
          These operations will become available when the workspace service is ready. Sample changes
          stay in this browser and never create real members or devices.
        </p>
      </div>
      <Link className="text-link" href="/">
        Explore sample sessions
      </Link>
    </main>
  );
}
