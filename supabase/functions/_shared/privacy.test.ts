import assert from 'node:assert/strict';
import { redactPayload, redactText } from './privacy.ts';
import { ingestRequestSchema, teamsRequestSchema } from './contracts.js';
Deno.test('removes credentials, authorization and ShareSpace tokens from source excerpts', () => {
  const token = `ssd-${'a'.repeat(64)}`;
  const key = `sb_secret_${'b'.repeat(30)}`;
  const output = redactText(`${token} ${key} postgresql://user:pass@database.local/app Bearer abcdefghijkl`);
  for (const secret of [token, key, 'pass', 'abcdefghijkl']) assert.equal(output.includes(secret), false);
});
Deno.test('removes local absolute and credential paths while retaining safe relative paths', () => {
  assert.deepEqual(redactPayload({ relative_paths: ['src/app.ts', '.env.local', '.ssh/id_rsa'], text: '/Users/test/private.txt C:\\Users\\test\\secret.txt' }), { relative_paths: ['src/app.ts'], text: '[PATH] [PATH]' });
});
Deno.test('existing contract rejects unknown actor fields and unbounded raw source', () => {
  assert.equal(teamsRequestSchema.safeParse({ action: 'create_team', team_name: 'Test', repository_name: 'acme/app', user_id: crypto.randomUUID() }).success, false);
  assert.equal(ingestRequestSchema.safeParse({ events: [{ event_id: crypto.randomUUID(), session_id: crypto.randomUUID(), sequence: 0, kind: 'user.message', occurred_at: new Date().toISOString(), redacted: false, truncated: false, payload: { text: 'a'.repeat(4001), branch: null } }] }).success, false);
});
Deno.test('redacted excerpts still satisfy the canonical ingest contract', () => {
  const value = { events: [{ event_id: crypto.randomUUID(), session_id: crypto.randomUUID(), sequence: 0, kind: 'user.message', occurred_at: new Date().toISOString(), redacted: true, truncated: false, payload: redactPayload({ text: `Use token=${'a'.repeat(24)}`, branch: 'demo' }) }] };
  assert.equal(ingestRequestSchema.safeParse(value).success, true);
});
