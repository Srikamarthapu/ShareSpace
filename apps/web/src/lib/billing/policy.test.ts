import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { isSandboxKey, paidSandboxReceipt, trustedAppOrigin } from './policy';

const user = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function fixture(overrides: Record<string, unknown> = {}, live = false) {
  return { id: 'evt_fixture', type: 'checkout.session.completed', livemode: live, data: { object: { id: 'cs_test_fixture', mode: 'payment', payment_status: 'paid', livemode: live, client_reference_id: user, metadata: { purpose: 'sharespace_sandbox', user_id: user }, ...overrides } } } as unknown as Stripe.Event;
}
describe('sandbox billing trust boundary', () => {
  it('refuses live keys and non-local cleartext redirect origins', () => {
    expect(isSandboxKey('rk_test_example')).toBe(true);
    expect(isSandboxKey('sk_live_example')).toBe(false);
    expect(trustedAppOrigin('http://example.com')).toBeNull();
    expect(trustedAppOrigin('https://user:pass@example.com')).toBeNull();
    expect(trustedAppOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it('does not fulfill unpaid, foreign, invalid-user, or live events', () => {
    expect(paidSandboxReceipt(fixture({ payment_status: 'unpaid' }))).toBeNull();
    expect(paidSandboxReceipt(fixture({ metadata: {} }))).toBeNull();
    expect(paidSandboxReceipt(fixture({ client_reference_id: 'invalid' }))).toBeNull();
    expect(paidSandboxReceipt(fixture({}, true))).toBeNull();
    expect(paidSandboxReceipt(fixture())).toEqual({ eventId: 'evt_fixture', eventType: 'checkout.session.completed', sessionId: 'cs_test_fixture', userId: user });
  });
  it('verifies the original payload and rejects a changed payload', () => {
    const stripe = new Stripe('sk_test_synthetic');
    const secret = 'whsec_synthetic_only';
    const payload = JSON.stringify(fixture());
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe('evt_fixture');
    expect(() => stripe.webhooks.constructEvent(payload.replace('evt_fixture', 'evt_forged'), header, secret)).toThrow();
  });
});
