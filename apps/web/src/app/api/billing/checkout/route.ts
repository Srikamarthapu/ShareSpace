import { z } from 'zod';
import { apiError, hasSameOrigin } from '@/lib/api/http';
import { createSupabaseServer } from '@/lib/supabase/server';
import { stripeClient, stripeConfig } from '@/lib/billing/stripe';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config) return apiError(503, 'BILLING_NOT_CONFIGURED', 'Stripe sandbox checkout is not configured.');
  if (!hasSameOrigin(request, config.origin)) return apiError(403, 'INVALID_ORIGIN', 'Checkout must start from this application.');
  const key = z.uuid().safeParse(request.headers.get('idempotency-key'));
  if (!key.success) return apiError(400, 'INVALID_REQUEST_KEY', 'Provide a UUID idempotency key.');
  const client = await createSupabaseServer();
  if (!client) return apiError(503, 'AUTH_NOT_CONFIGURED', 'Supabase authentication is not configured.');
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return apiError(401, 'UNAUTHENTICATED', 'Sign in before opening checkout.');
  try {
    const stripe = stripeClient(config.key);
    const price = await stripe.prices.retrieve(config.price);
    if (!price.active || price.livemode || price.type !== 'one_time') return apiError(503, 'INVALID_SANDBOX_PRICE', 'Configure an active one-time price in your Stripe sandbox.');
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment', line_items: [{ price: config.price, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id, purpose: 'sharespace_sandbox' },
      success_url: `${config.origin}/live/billing?checkout=returned`,
      cancel_url: `${config.origin}/live/billing?checkout=cancelled`,
      integration_identifier: 'sharespace-sandbox-qmnrtsuv',
    }, { idempotencyKey: `sandbox:${user.id}:${key.data}` });
    return Response.json({ url: checkout.url }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return apiError(502, 'CHECKOUT_UNAVAILABLE', 'Stripe checkout could not be opened. Try again.'); }
}
