import type Stripe from 'stripe';
import { z } from 'zod';

export function isSandboxKey(key: string) { return /^(rk|sk)_test_[A-Za-z0-9]+$/.test(key); }
export function trustedAppOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
export function paidSandboxReceipt(event: Stripe.Event) {
  if (event.livemode) return null;
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return null;
  const session = event.data.object;
  if (session.mode !== 'payment' || session.payment_status !== 'paid' || session.livemode || session.metadata?.purpose !== 'sharespace_sandbox') return null;
  const user = z.uuid().safeParse(session.client_reference_id);
  if (!user.success || session.metadata.user_id !== user.data) return null;
  return { eventId: event.id, eventType: event.type, sessionId: session.id, userId: user.data };
}
