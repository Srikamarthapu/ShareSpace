import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import {
  effectivePlan,
  isBillingEvent,
  isDemoPrice,
  isSandboxKey,
  subscriptionSnapshot,
  trustedAppOrigin,
} from "./policy";

const price = {
  id: "price_demo",
  active: true,
  livemode: false,
  currency: "usd",
  unit_amount: 2000,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1 },
} as Stripe.Price;
const now = Date.parse("2026-10-03T12:00:00Z");
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_fixture",
    livemode: false,
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ price, quantity: 1, current_period_end: now / 1000 + 86400 }] },
    latest_invoice: { id: "in_fixture", livemode: false, status: "paid" },
    ...overrides,
  } as unknown as Stripe.Subscription;
}
describe("test subscription trust boundary", () => {
  it("refuses live keys and unsafe redirect origins", () => {
    expect(isSandboxKey("rk_test_example")).toBe(true);
    expect(isSandboxKey("sk_live_example")).toBe(false);
    expect(trustedAppOrigin("http://example.com")).toBeNull();
    expect(trustedAppOrigin("https://user:pass@example.com")).toBeNull();
    expect(trustedAppOrigin("https://example.com/path")).toBeNull();
    expect(trustedAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it("enforces the exact active monthly USD20 test price", () => {
    expect(isDemoPrice(price)).toBe(true);
    for (const change of [
      { active: false },
      { livemode: true },
      { currency: "eur" },
      { unit_amount: 1999 },
      { type: "one_time" },
      { recurring: { interval: "year", interval_count: 1 } },
      { recurring: { interval: "month", interval_count: 2 } },
    ]) {
      expect(isDemoPrice({ ...price, ...change } as Stripe.Price)).toBe(false);
    }
  });
  it("grants only a current, paid, test subscription with exactly one configured item", () => {
    expect(subscriptionSnapshot(fixture(), price.id, now).plan).toBe("pro");
    for (const change of [
      { status: "trialing" },
      { status: "past_due" },
      { status: "canceled" },
      { livemode: true },
      { latest_invoice: null },
      { latest_invoice: "in_unexpanded" },
      { latest_invoice: { status: "open" } },
      { items: { data: [{ price, quantity: 2, current_period_end: now / 1000 + 86400 }] } },
      { items: { data: [{ price, quantity: 1, current_period_end: now / 1000 - 1 }] } },
    ]) {
      expect(subscriptionSnapshot(fixture(change), price.id, now).plan).toBe("free");
    }
    expect(subscriptionSnapshot(fixture(), "price_foreign", now).plan).toBe("free");
  });
  it("keeps paid access until period end when cancellation is scheduled", () => {
    expect(
      subscriptionSnapshot(fixture({ cancel_at_period_end: true }), price.id, now),
    ).toMatchObject({ plan: "pro", cancel_at_period_end: true });
    expect(
      effectivePlan(
        { plan: "pro", status: "active", current_period_end: new Date(now - 1).toISOString() },
        now,
      ),
    ).toBe("free");
  });
  it("handles recurring lifecycle and invoice events but ignores unrelated events", () => {
    for (const type of [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
    ])
      expect(isBillingEvent(type)).toBe(true);
    expect(isBillingEvent("payment_intent.succeeded")).toBe(false);
  });
  it("verifies original raw payloads, rejects tampering and stale signatures", () => {
    const stripe = new Stripe("sk_test_synthetic");
    const secret = "whsec_synthetic_only";
    const payload = JSON.stringify({
      id: "evt_fixture",
      type: "customer.subscription.updated",
      livemode: false,
      data: { object: fixture() },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_fixture");
    expect(() =>
      stripe.webhooks.constructEvent(payload.replace("evt_fixture", "evt_forged"), header, secret),
    ).toThrow();
    const stale = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: 1 });
    expect(() => stripe.webhooks.constructEvent(payload, stale, secret)).toThrow();
  });
});
