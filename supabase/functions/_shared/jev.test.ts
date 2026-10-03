import assert from 'node:assert/strict';
import { checkWithJev, contextSchema, evaluateAnswers, questionsFor } from './jev.ts';
const context = contextSchema.parse({ request_text: 'Implement team invitations', candidates: [{ session_id: '30000000-0000-4000-8000-000000000001', user_id: '10000000-0000-4000-8000-000000000002', event_id: '20000000-0000-4000-8000-000000000001', text: 'I am implementing team invitations', title: 'Team invitations', branch: 'demo', touched_paths: ['src/invites.ts'] }] });
const choice = (selected: string, options: string[]) => ({ type: 'choice', choice: selected, confidence: 0.9, probabilities: Object.fromEntries(options.map((option) => [option, option === selected ? 1 : 0])) });
const response = (relation: string, implementation = 'yes') => ({ answers: { implementation: choice(implementation, ['yes', 'no']), candidate_0: choice(relation, ['overlapping', 'related', 'unrelated']) } });
Deno.test('Jev typed decisions create warnings only from supplied authorized evidence', () => {
  const result = evaluateAnswers(context, response('overlapping'));
  assert.equal(result.outcome, 'warning');
  assert.equal(result.findings[0].related_session_id, context.candidates[0].session_id);
  assert.equal(result.findings[0].evidence[0].event_id, context.candidates[0].event_id);
  assert.equal(result.findings[0].score, 1);
  assert.deepEqual(Object.keys(questionsFor(context)), ['implementation', 'candidate_0']);
});
Deno.test('Jev distinguishes related, unrelated, and nonimplementation requests', () => {
  assert.equal(evaluateAnswers(context, response('related')).outcome, 'no_overlap');
  assert.equal(evaluateAnswers(context, response('unrelated')).findings.length, 0);
  assert.equal(evaluateAnswers(context, response('overlapping', 'no')).outcome, 'not_applicable');
});
Deno.test('Jev rejects incomplete, invented, and malformed provider answers', () => {
  assert.equal(evaluateAnswers(context, { answers: {} }).unavailable_reason, 'invalid_response');
  assert.equal(evaluateAnswers(context, response('invented')).unavailable_reason, 'invalid_response');
  const invalid = response('overlapping'); invalid.answers.candidate_0.probabilities.overlapping = 2;
  assert.equal(evaluateAnswers(context, invalid).outcome, 'unavailable');
});
Deno.test('Jev uses the documented SystemOne API and handles provider failures honestly', async () => {
  const fakeFetch: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options?.method, 'POST');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'jev-latest');
    assert.equal(body.messages, undefined);
    return new Response(JSON.stringify(response('overlapping')));
  };
  assert.equal((await checkWithJev(context, { key: 'test-only' }, fakeFetch)).outcome, 'warning');
  assert.equal((await checkWithJev(context, {}, fakeFetch)).unavailable_reason, 'provider_unconfigured');
  assert.equal((await checkWithJev(context, { key: 'test-only' }, async () => new Response(null, { status: 500 }))).unavailable_reason, 'provider_error');
  assert.equal((await checkWithJev(context, { key: 'test-only' }, async () => new Response('bad'))).unavailable_reason, 'invalid_response');
  assert.equal((await checkWithJev(context, { key: 'test-only' }, async () => new Response('x'.repeat(65537)))).unavailable_reason, 'invalid_response');
});
