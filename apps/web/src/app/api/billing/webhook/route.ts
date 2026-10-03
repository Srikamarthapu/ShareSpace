import { createClient } from '@supabase/supabase-js';
import { apiError, boundedText, BodyTooLargeError } from '@/lib/api/http';
import { stripeClient } from '@/lib/billing/stripe';
import { isSandboxKey, paidSandboxReceipt } from '@/lib/billing/policy';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const databaseSecret = process.env.SUPABASE_SECRET_KEY;
  if (!isSandboxKey(key) || !secret || !databaseUrl || !databaseSecret) return apiError(503, 'WEBHOOK_NOT_CONFIGURED', 'The sandbox webhook is not configured.');
  const signature = request.headers.get('stripe-signature');
  if (!signature) return apiError(400, 'INVALID_SIGNATURE', 'A valid Stripe signature is required.');
  let event;
  try {
    const raw = await boundedText(request, 1024 * 1024);
    event = stripeClient(key).webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return apiError(413, 'PAYLOAD_TOO_LARGE', 'Webhook payload exceeds the limit.');
    return apiError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
  }
  if (event.livemode) return apiError(400, 'LIVE_MODE_DISABLED', 'This starter accepts sandbox events only.');
  const receipt = paidSandboxReceipt(event);
  if (!receipt) return Response.json({ received: true, handled: false });
  // A verified event ID and paid receipt are committed together. DB failure is retryable.
  const database = createClient(databaseUrl, databaseSecret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await database.rpc('record_sandbox_payment', {
    p_event_id: receipt.eventId, p_event_type: receipt.eventType,
    p_checkout_session_id: receipt.sessionId, p_user_id: receipt.userId,
  });
  if (error) return apiError(503, 'RECEIPT_NOT_STORED', 'The receipt could not be stored; retry this event.');
  return Response.json({ received: true, handled: true }, { headers: { 'Cache-Control': 'no-store' } });
}
