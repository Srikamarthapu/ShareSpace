import { apiError } from '@/lib/api/http';

export async function POST() {
  return apiError(410, 'ENDPOINT_RETIRED', 'This starter endpoint has been retired. Use the Supabase overlap-check Edge Function with a paired device token. This request performed no check.');
}
