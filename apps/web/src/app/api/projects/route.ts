import { apiError } from '@/lib/api/http';

export async function GET() {
  return apiError(410, 'ENDPOINT_RETIRED', 'This starter endpoint has been retired. Read teams and repositories with your authenticated Supabase client, or open /live.');
}
