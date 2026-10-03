import "server-only";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { createSupabaseServer } from "../supabase/server";
import { FREE_BILLING, subscriptionSnapshot, type BillingSnapshot } from "./policy";

export class BillingError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type BillingRow = BillingSnapshot & {
  team_id: string;
  customer_id: string | null;
  updated_at: string;
};
export type BillingLease = {
  token: string;
  billing: BillingRow;
  checkout_id: string | null;
  checkout_request_key: string | null;
};
export function billingDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret)
    throw new BillingError(503, "BILLING_NOT_CONFIGURED", "Billing is not configured.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function billingActor() {
  const client = await createSupabaseServer();
  if (!client) throw new BillingError(503, "AUTH_NOT_CONFIGURED", "Sign-in is not configured.");
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    throw new BillingError(401, "UNAUTHENTICATED", "Sign in before managing billing.");
  const { data: membership, error: memberError } = await client
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError)
    throw new BillingError(503, "MEMBERSHIP_UNAVAILABLE", "Team membership could not be checked.");
  if (!membership)
    throw new BillingError(409, "TEAM_REQUIRED", "Create a workspace before subscribing.");
  if (membership.role !== "admin")
    throw new BillingError(403, "ADMIN_REQUIRED", "Only a workspace admin can manage billing.");
  return { user, teamId: membership.team_id as string };
}
export async function billingCommand(
  teamId: string,
  action: string,
  token: string | null = null,
  data: Record<string, unknown> = {},
) {
  const result = await billingDatabase().rpc("billing_command", {
    p_team_id: teamId,
    p_action: action,
    p_token: token,
    p_data: data,
  });
  if (result.error)
    throw new BillingError(
      503,
      "BILLING_STORAGE_UNAVAILABLE",
      "Billing state could not be stored. Retry shortly.",
    );
  return result.data;
}
export async function claimBilling(teamId: string, eventId?: string): Promise<BillingLease | null> {
  const result = await billingCommand(teamId, "claim", null, eventId ? { event_id: eventId } : {});
  if (result.duplicate) return null;
  if (result.busy)
    throw new BillingError(503, "BILLING_BUSY", "Billing is updating. Retry shortly.");
  return result as BillingLease;
}
export async function releaseBilling(teamId: string, token: string) {
  // Lease expiry also recovers from process termination. Never mask the original failure.
  try {
    await billingCommand(teamId, "release", token);
  } catch {
    /* A later retry may claim after the lease expires. */
  }
}
export async function canonicalSubscriptions(stripe: Stripe, customerId: string, priceId: string) {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.latest_invoice"],
  });
  if (list.has_more)
    throw new BillingError(
      503,
      "BILLING_RECONCILIATION_REQUIRED",
      "Subscription history needs reconciliation.",
    );
  if (list.data.some((item) => item.livemode))
    throw new BillingError(400, "LIVE_MODE_DISABLED", "Live subscriptions are disabled.");
  const subscriptions = list.data
    .filter((item) => item.items.data.some((line) => line.price.id === priceId))
    .sort((a, b) => b.created - a.created || b.id.localeCompare(a.id));
  const snapshots = subscriptions.map((item) => subscriptionSnapshot(item, priceId));
  return {
    subscriptions,
    snapshot: snapshots.find((item) => item.plan === "pro") ?? snapshots[0] ?? FREE_BILLING,
  };
}
export async function reconcileCustomer(
  stripe: Stripe,
  teamId: string,
  customerId: string,
  priceId: string,
  lease: BillingLease,
  event: { id: string; type: string },
) {
  const { snapshot } = await canonicalSubscriptions(stripe, customerId, priceId);
  await billingCommand(teamId, "complete", lease.token, {
    ...snapshot,
    event_id: event.id,
    event_type: event.type,
  });
  return snapshot;
}
