import { apiError, boundedText, BodyTooLargeError } from "@/lib/api/http";
import { stripeClient, stripeConfig } from "@/lib/billing/stripe";
import { isBillingEvent, stripeId } from "@/lib/billing/policy";
import {
  BillingError,
  billingDatabase,
  claimBilling,
  reconcileCustomer,
  releaseBilling,
} from "@/lib/billing/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const config = stripeConfig();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!config || !secret)
    return apiError(
      503,
      "WEBHOOK_NOT_CONFIGURED",
      "The test subscription webhook is not configured.",
    );
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return apiError(400, "INVALID_SIGNATURE", "A valid Stripe signature is required.");
  const stripe = stripeClient(config.key);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      await boundedText(request, 1024 * 1024),
      signature,
      secret,
    );
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return apiError(413, "PAYLOAD_TOO_LARGE", "Webhook payload exceeds the limit.");
    return apiError(400, "INVALID_SIGNATURE", "Webhook signature verification failed.");
  }
  if (event.livemode)
    return apiError(400, "LIVE_MODE_DISABLED", "Only test-mode Stripe events are accepted.");
  if (!isBillingEvent(event.type)) return Response.json({ received: true, handled: false });
  // A signed event identifies its Stripe customer. Ownership comes from our existing
  // unique customer mapping, never client_reference_id or arbitrary event metadata.
  const object = event.data.object;
  const customerId =
    "customer" in object ? stripeId(object.customer as string | { id: string } | null) : null;
  if (!customerId) return Response.json({ received: true, handled: false });
  let held: { teamId: string; token: string } | null = null;
  try {
    const database = billingDatabase();
    const { data: billing, error } = await database
      .from("team_billing")
      .select("team_id")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error)
      throw new BillingError(
        503,
        "BILLING_UNAVAILABLE",
        "Customer ownership could not be checked. Retry this event.",
      );
    if (!billing) return Response.json({ received: true, handled: false });
    const lease = await claimBilling(billing.team_id, event.id);
    if (!lease) return Response.json({ received: true, duplicate: true });
    held = { teamId: billing.team_id, token: lease.token };
    // Canonical state is read under the lease, so reordered events cannot replay old state.
    await reconcileCustomer(stripe, billing.team_id, customerId, config.price, lease, event);
    held = null;
    return Response.json(
      { received: true, handled: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return error instanceof BillingError
      ? apiError(error.status, error.code, error.message)
      : apiError(
          503,
          "BILLING_RETRY_REQUIRED",
          "Subscription verification failed. Retry this event.",
        );
  } finally {
    if (held) await releaseBilling(held.teamId, held.token);
  }
}
