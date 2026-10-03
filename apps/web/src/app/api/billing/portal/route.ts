import { apiError, hasSameOrigin } from "@/lib/api/http";
import { stripeClient, stripeConfig } from "@/lib/billing/stripe";
import { BillingError, billingActor, billingDatabase } from "@/lib/billing/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config)
    return apiError(503, "BILLING_NOT_CONFIGURED", "The test subscription is not configured.");
  if (!hasSameOrigin(request, config.origin))
    return apiError(403, "INVALID_ORIGIN", "Manage billing from this application.");
  try {
    const { teamId } = await billingActor();
    const { data, error } = await billingDatabase()
      .from("team_billing")
      .select("customer_id")
      .eq("team_id", teamId)
      .maybeSingle();
    if (error) throw new BillingError(503, "BILLING_UNAVAILABLE", "Billing is unavailable.");
    if (!data?.customer_id)
      throw new BillingError(409, "NO_SUBSCRIPTION", "Start a test subscription first.");
    const stripe = stripeClient(config.key);
    const customer = await stripe.customers.retrieve(data.customer_id);
    if (customer.deleted || customer.livemode)
      throw new BillingError(400, "INVALID_CUSTOMER", "A test customer is required.");
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${config.origin}/live/billing`,
    });
    return Response.json(
      { url: portal.url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return error instanceof BillingError
      ? apiError(error.status, error.code, error.message)
      : apiError(502, "PORTAL_UNAVAILABLE", "The Stripe test portal could not be opened.");
  }
}
