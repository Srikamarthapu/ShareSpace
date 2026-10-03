import 'server-only';
import Stripe from 'stripe';
import { isSandboxKey, trustedAppOrigin } from './policy';

export function stripeConfig() {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const origin = trustedAppOrigin(process.env.APP_URL);
  const price = process.env.STRIPE_SANDBOX_PRICE_ID;
  if (!isSandboxKey(key) || !origin || !price?.startsWith('price_')) return null;
  return { key, origin, price };
}
export function stripeClient(key: string) {
  // The pinned SDK chooses its matching API version. Never expose this client to a browser.
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 8_000 });
}
