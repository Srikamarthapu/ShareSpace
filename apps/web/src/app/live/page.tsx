import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { signOut } from '@/features/auth/actions';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Real workspace' };
export default async function Page() {
  const client = await createSupabaseServer();
  if (!client) redirect('/login');
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) redirect('/login');
  const { data: projects, error } = await client.from('projects').select('id, name').order('created_at');
  return <main className="standalone-page"><div className="eyebrow">AUTHENTICATED WORKSPACE</div><h1>Your projects</h1><p>Signed in as {user.email}. This page reads real, membership-scoped database records.</p>{error ? <div role="alert" className="inline-note">Project data is unavailable. Verify your migrations and database permissions.</div> : projects?.length ? <ul>{projects.map(project => <li key={project.id}><strong>{project.name}</strong><p className="muted small">Project ID: {project.id}</p></li>)}</ul> : <div className="empty-state"><h2>No projects yet</h2><p>Auth is connected. Next, implement transactional project creation and invitations using the database foundation.</p></div>}<p className="muted small">The collaborative screens still use a separate sample store. Wire them to the authorized API in the next milestone.</p><div className="button-row"><Link className="button button-secondary" href="/live/billing">Stripe sandbox</Link><Link className="button button-secondary" href="/">Explore sample workspace</Link><form action={signOut}><button className="button button-secondary" type="submit">Sign out</button></form></div></main>;
}
