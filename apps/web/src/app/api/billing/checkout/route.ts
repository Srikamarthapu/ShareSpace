import { z } from "zod";
import { apiError, hasSameOrigin } from "@/lib/api/http";
import { stripeClient, stripeConfig } from "@/lib/billing/stripe";
import { isDemoPrice } from "@/lib/billing/policy";
import {
  BillingError,
  billingActor,
  billingCommand,
  canonicalSubscriptions,
  claimBilling,
  releaseBilling,
} from "@/lib/billing/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config)
    return apiError(503, "BILLING_NOT_CONFIGURED", "The test subscription is not configured.");
  if (!hasSameOrigin(request, config.origin))
    return apiError(403, "INVALID_ORIGIN", "Checkout must start from this application.");
  const requestKey = z.uuid().safeParse(request.headers.get("idempotency-key"));
  if (!requestKey.success)
    return apiError(400, "INVALID_REQUEST_KEY", "Provide a UUID idempotency key.");
  let held: { teamId: string; token: string } | null = null;
  try {
    const { teamId } = await billingActor();
    const lease = await claimBilling(teamId);
    if (!lease) throw new Error("Missing billing lease");
    held = { teamId, token: lease.token };
    const stripe = stripeClient(config.key);
    const price = await stripe.prices.retrieve(config.price);
    if (!isDemoPrice(price))
      throw new BillingError(
        503,
        "INVALID_SANDBOX_PRICE",
        "Configure an active $20 USD monthly test price.",
      );
    let customerId = lease.billing.customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { name: "ShareSpace workspace", metadata: { sharespace_team_id: teamId } },
        { idempotencyKey: `sharespace:test:customer:${teamId}` },
      );
      if (customer.livemode)
        throw new BillingError(400, "LIVE_MODE_DISABLED", "Live customers are disabled.");
      customerId = customer.id;
      await billingCommand(teamId, "customer", lease.token, { customer_id: customerId });
    }
    const { subscriptions } = await canonicalSubscriptions(stripe, customerId, config.price);
    if (subscriptions.some((item) => !["canceled", "incomplete_expired"].includes(item.status))) {
      throw new BillingError(
        409,
        "SUBSCRIPTION_EXISTS",
        "This workspace already has a subscription. Use Manage subscription.",
      );
    }
    if (lease.checkout_id) {
      const previous = await stripe.checkout.sessions.retrieve(lease.checkout_id);
      if (previous.status === "open" && previous.url)
        return Response.json(
          { url: previous.url },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      if (previous.status === "complete" && !subscriptions.length)
        throw new BillingError(
          409,
          "SUBSCRIPTION_PENDING",
          "Your checkout is processing. Wait for the verified subscription update.",
        );
    }
    // Persist the request key before the network call. A process crash can then retry
    // the same Stripe operation even when the browser supplies a fresh request UUID.
    const checkoutKey =
      !lease.checkout_id && lease.checkout_request_key
        ? lease.checkout_request_key
        : requestKey.data;
    await billingCommand(teamId, "checkout", lease.token, {
      checkout_id: null,
      request_key: checkoutKey,
    });
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: config.price, quantity: 1 }],
        client_reference_id: teamId,
        metadata: { purpose: "sharespace_demo_subscription" },
        subscription_data: { metadata: { purpose: "sharespace_demo_subscription" } },
        success_url: `${config.origin}/live/billing?checkout=returned`,
        cancel_url: `${config.origin}/live/billing?checkout=cancelled`,
        integration_identifier: "sharespace-demo-qmnrtsuv",
      },
      { idempotencyKey: `sharespace:test:checkout:${teamId}:${checkoutKey}` },
    );
    if (checkout.livemode || !checkout.url)
      throw new BillingError(502, "CHECKOUT_UNAVAILABLE", "Stripe did not return a test checkout.");
    await billingCommand(teamId, "checkout", lease.token, {
      checkout_id: checkout.id,
      request_key: checkoutKey,
    });
    return Response.json(
      { url: checkout.url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return error instanceof BillingError
      ? apiError(error.status, error.code, error.message)
      : apiError(502, "CHECKOUT_UNAVAILABLE", "Stripe checkout could not be opened. Try again.");
  } finally {
    if (held) await releaseBilling(held.teamId, held.token);
  }
}
