import { apiError } from '@/lib/api/http';

// Fail closed until a revocable device credential can derive the server-owned scope.
// Never accept a user/project identity supplied by the adapter as authorization.
export async function POST() {
  return apiError(503, 'DEVICE_INGESTION_NOT_READY', 'Device pairing and authorized ingestion are not implemented in this starter. No events were stored.');
}
