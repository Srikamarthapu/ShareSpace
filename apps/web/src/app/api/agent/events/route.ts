import { apiError } from '@/lib/api/http';

export async function POST() {
  return apiError(410, 'ENDPOINT_RETIRED', 'This starter endpoint has been retired. Use the Supabase ingest Edge Function with a paired device token. This request stored no events.');
}
