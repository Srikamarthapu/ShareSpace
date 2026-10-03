import { apiError } from '@/lib/api/http';
export async function POST() {
  return apiError(503, 'PREFLIGHT_NOT_READY', 'No check was performed. Authorized retrieval and a live decision provider are not connected.');
}
