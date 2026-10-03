import { createClient } from '@supabase/supabase-js';
import { teamsRequestSchema, devicesRequestSchema, sharingRequestSchema, ingestRequestSchema, overlapCheckRequestSchema, apiErrorCodeSchema } from './contracts.js';
import { redactPayload, redactText } from './privacy.ts';
import { checkWithJev, contextSchema, evaluationSchema } from './jev.ts';

type FunctionName = 'teams' | 'devices' | 'sharing' | 'ingest' | 'overlap-check';
type JsonObject = Record<string, unknown>;
const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const encoder = new TextEncoder();
const maxBody = 524288;
const errors: Record<string, [number, string]> = {
  invalid_request: [400, 'The request is invalid.'], unauthenticated: [401, 'Sign in again to continue.'],
  device_unknown: [401, 'Pair this adapter before uploading.'], device_revoked: [401, 'This device was revoked. Pair again to continue.'],
  forbidden: [403, 'You do not have access to this action, or the team/device limit was reached.'],
  not_member: [403, 'You are no longer a member of this team.'], not_found: [404, 'The requested item was not found.'],
  already_in_team: [409, 'You already belong to a team.'], last_admin: [409, 'The last administrator cannot be removed.'],
  invite_rotated: [409, 'This invitation is invalid or has been rotated.'], pairing_expired: [409, 'This pairing request expired or was already used.'],
  repository_mismatch: [409, 'This device repository does not match your team repository.'],
  sharing_disabled: [409, 'Sharing is off. Enable it explicitly before uploading.'], sharing_paused: [409, 'Sharing is paused.'],
  payload_too_large: [413, 'The upload exceeds the allowed size.'], rate_limited: [429, 'Too many requests. Try again shortly.'],
  storage_paused: [507, 'Uploads are paused because storage is full.'], unavailable: [503, 'The service is temporarily unavailable.'],
  internal: [500, 'The request could not be completed.'],
};
function randomToken(prefix: string): string {
  return prefix + Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('');
}
function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), (n) => n.toString(16).padStart(2, '0')).join('');
}
async function body(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBody) throw new Error('payload_too_large');
  if (!request.body) throw new Error('invalid_request');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBody) { await reader.cancel(); throw new Error('payload_too_large'); }
    chunks.push(part.value);
  }
  const combined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(combined)); } catch { throw new Error('invalid_request'); }
}
function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('APP_ORIGIN') ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const headers: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-sharespace-device-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
export function serve(name: FunctionName): void {
  Deno.serve(async (request) => {
    const headers = { ...jsonHeaders, ...cors(request) };
    const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    const fail = (code: string, detail?: string) => {
      const [status, message] = errors[code] ?? errors.internal;
      const safeDetails = ['Team member limit reached. Upgrade the test plan or remove a member.', 'Repository limit reached. The test Pro plan supports five repositories.', 'Revoke an old device before pairing another.'];
      return respond({ error: { code: errors[code] ? code : 'internal', message: detail && safeDetails.includes(detail) ? detail : message, ...(code === 'rate_limited' ? { retry_after_ms: 60000 } : {}) } }, status);
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return fail('invalid_request');
    try {
      const input = await body(request);
      const schema = { teams: teamsRequestSchema, devices: devicesRequestSchema, sharing: sharingRequestSchema, ingest: ingestRequestSchema, 'overlap-check': overlapCheckRequestSchema }[name];
      const parsed = schema.safeParse(input);
      if (!parsed.success) return fail('invalid_request');
      const data = parsed.data as JsonObject;
      const action = name === 'ingest' ? 'ingest' : name === 'overlap-check' ? 'overlap_check' : String(data.action);
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceKey) return fail('unavailable');
      const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      let actor: string | null = null;
      let tokenHash: string | null = null;
      if (['device_status', 'ingest', 'overlap_check'].includes(action)) {
        const token = request.headers.get('x-sharespace-device-token') ?? '';
        if (!/^ssd-[0-9a-f]{64}$/.test(token)) return fail('device_unknown');
        tokenHash = await digest(token);
      } else if (!['start_pairing', 'poll_pairing'].includes(action)) {
        const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!bearer) return fail('unauthenticated');
        const { data: identity, error } = await db.auth.getUser(bearer);
        if (error || !identity.user || identity.user.is_anonymous) return fail('unauthenticated');
        actor = identity.user.id;
        // Display data is never used to authorize an action.
        data.display_name = redactText(String(identity.user.user_metadata?.display_name ?? identity.user.user_metadata?.full_name ?? identity.user.email?.split('@')[0] ?? 'Builder')).slice(0, 100) || 'Builder';
      }
      let pollSecret: string | undefined;
      let deviceToken: string | undefined;
      if (action === 'rotate_invite') data.new_token = randomToken('ssi-');
      if (action === 'start_pairing') {
        pollSecret = randomToken('ssp-'); data.poll_secret_hash = await digest(pollSecret); data.user_code = randomCode();
      }
      if (action === 'poll_pairing') {
        data.poll_secret_hash = await digest(String(data.poll_secret)); delete data.poll_secret;
        deviceToken = randomToken('ssd-'); data.device_token_hash = await digest(deviceToken);
      }
      if (action === 'ingest') {
        data.events = (data.events as JsonObject[]).map((event) => {
          const safePayload = redactPayload(event.payload);
          return { ...event, payload: safePayload, redacted: event.redacted || JSON.stringify(safePayload) !== JSON.stringify(event.payload) };
        });
        if (!ingestRequestSchema.safeParse({ events: data.events }).success) return fail('invalid_request');
        // Reject future timestamps instead of letting them pin sessions forever in a quota window.
        if ((data.events as JsonObject[]).some((event) => new Date(String(event.occurred_at)).getTime() > Date.now() + 300000)) return fail('invalid_request');
      }
      if (action === 'overlap_check') data.prompt_text = redactText(String(data.prompt_text));
      if (action === 'overlap_check') {
        const { data: context, error: contextError } = await db.rpc('demo_api', { p_action: 'overlap_context', p_payload: data, p_actor: null, p_token_hash: tokenHash });
        if (contextError) return fail(apiErrorCodeSchema.safeParse(contextError.message).success ? contextError.message : 'internal');
        if (context.cached) return respond(context.cached);
        const parsedContext = contextSchema.safeParse(context);
        if (!parsedContext.success) return fail('unavailable');
        const evaluation = await checkWithJev(parsedContext.data, { key: Deno.env.get('JEV_API_KEY'), baseUrl: Deno.env.get('JEV_BASE_URL'), model: Deno.env.get('JEV_MODEL') });
        data._evaluation = evaluationSchema.parse(evaluation);
        data._source_context = parsedContext.data.candidates.map(({ session_id, user_id, event_id }) => ({ session_id, user_id, event_id }));
      }
      const { data: result, error } = await db.rpc('demo_api', { p_action: action, p_payload: data, p_actor: actor, p_token_hash: tokenHash });
      if (error) return fail(apiErrorCodeSchema.safeParse(error.message).success ? error.message : 'internal', error.details);
      if (action === 'start_pairing') {
        const appOrigin = (Deno.env.get('APP_ORIGIN') ?? '').split(',')[0]?.trim();
        if (!appOrigin) return fail('unavailable');
        return respond({ ...result, approve_url: `${appOrigin}/live?view=devices&code=${encodeURIComponent(result.user_code)}`, poll_secret: pollSecret, poll_interval_ms: 2000 });
      }
      if (action === 'poll_pairing' && result.status === 'approved') return respond({ ...result, device_token: deviceToken });
      return respond(result);
    } catch (error) {
      // Never log request payloads, tokens, database detail, or source text.
      return fail(error instanceof Error && errors[error.message] ? error.message : 'internal');
    }
  });
}
