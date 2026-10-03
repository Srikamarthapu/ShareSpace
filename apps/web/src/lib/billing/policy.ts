import type Stripe from "stripe";

export const BILLING_LIMITS = {
  free: { members: 2, repositories: 1 },
  pro: { members: 10, repositories: 5 },
} as const;
export const BILLING_EVENTS = new Set<string>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
]);
export function isBillingEvent(type: string) {
  return type.startsWith("customer.subscription.") || BILLING_EVENTS.has(type);
}
export function isSandboxKey(key: string) {
  return /^(rk|sk)_test_[A-Za-z0-9]+$/.test(key);
}
export function trustedAppOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export function isDemoPrice(price: Stripe.Price) {
  return (
    price.active &&
    !price.livemode &&
    price.currency === "usd" &&
    price.unit_amount === 2000 &&
    price.type === "recurring" &&
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1
  );
}
export function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}
export type BillingSnapshot = {
  subscription_id: string | null;
  plan: "free" | "pro";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};
export const FREE_BILLING: BillingSnapshot = {
  subscription_id: null,
  plan: "free",
  status: "none",
  current_period_end: null,
  cancel_at_period_end: false,
};
export function subscriptionSnapshot(
  subscription: Stripe.Subscription,
  priceId: string,
  now = Date.now(),
): BillingSnapshot {
  const item = subscription.items.data[0];
  const valid =
    !subscription.livemode &&
    subscription.items.data.length === 1 &&
    item?.quantity === 1 &&
    item.price.id === priceId &&
    isDemoPrice(item.price);
  const end = item?.current_period_end;
  const invoice = subscription.latest_invoice;
  const paid =
    invoice && typeof invoice !== "string" && !invoice.livemode && invoice.status === "paid";
  const pro = valid && subscription.status === "active" && paid && !!end && end * 1000 > now;
  return {
    subscription_id: subscription.id,
    plan: pro ? "pro" : "free",
    status: subscription.status,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };
}
export function effectivePlan(
  billing: { plan: string; status: string; current_period_end: string | null } | null,
  now = Date.now(),
) {
  return billing?.plan === "pro" &&
    billing.status === "active" &&
    !!billing.current_period_end &&
    Date.parse(billing.current_period_end) > now
    ? "pro"
    : "free";
}
