import { createSupabaseServer } from '@/lib/supabase/server';
import { apiError } from '@/lib/api/http';
export async function GET() {
  const client = await createSupabaseServer();
  if (!client) return apiError(503, 'NOT_CONFIGURED', 'Supabase is not configured.');
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return apiError(401, 'UNAUTHENTICATED', 'Sign in to view projects.');
  const { data, error } = await client.from('projects').select('id, name').order('created_at');
  if (error) return apiError(503, 'DATA_UNAVAILABLE', 'Projects could not be loaded. Check migrations and database access.');
  return Response.json({ projects: data, request_id: crypto.randomUUID() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
