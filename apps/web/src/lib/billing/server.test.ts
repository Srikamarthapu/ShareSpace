import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), membership: vi.fn(), auth: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("../supabase/server", () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: mocks.auth },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.membership }) }) }),
  }),
}));
import {
  billingActor,
  canonicalSubscriptions,
  claimBilling,
  reconcileCustomer,
  type BillingLease,
} from "./server";

const team = "00000000-0000-4000-8000-00000000aaaa";
const price = {
  id: "price_demo",
  active: true,
  livemode: false,
  currency: "usd",
  unit_amount: 2000,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1 },
};
function subscription(status: string, id = "sub_demo", created = 100) {
  return {
    id,
    status,
    created,
    livemode: false,
    cancel_at_period_end: false,
    items: {
      data: [{ price, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
    },
    latest_invoice: { livemode: false, status: status === "active" ? "paid" : "open" },
  };
}
function stripe(data: unknown[], has_more = false) {
  return {
    subscriptions: { list: vi.fn().mockResolvedValue({ data, has_more }) },
  } as unknown as Stripe;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.example");
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic");
  mocks.auth.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mocks.membership.mockResolvedValue({ data: { team_id: team, role: "admin" }, error: null });
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
describe("billing ownership and reconciliation", () => {
  it("derives team ownership from the verified user membership", async () => {
    expect(await billingActor()).toEqual({ user: { id: "verified-user" }, teamId: team });
    mocks.membership.mockResolvedValue({ data: { team_id: team, role: "member" }, error: null });
    await expect(billingActor()).rejects.toMatchObject({ status: 403, code: "ADMIN_REQUIRED" });
  });
  it("rejects missing auth and missing team membership", async () => {
    mocks.auth.mockResolvedValue({ data: { user: null }, error: null });
    await expect(billingActor()).rejects.toMatchObject({ status: 401 });
    mocks.auth.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
    mocks.membership.mockResolvedValue({ data: null, error: null });
    await expect(billingActor()).rejects.toMatchObject({ status: 409, code: "TEAM_REQUIRED" });
  });
  it("uses current canonical state when an old cancellation arrives after a replacement subscription", async () => {
    const state = await canonicalSubscriptions(
      stripe([subscription("canceled", "sub_old", 100), subscription("active", "sub_new", 200)]),
      "cus_demo",
      price.id,
    );
    expect(state.snapshot).toMatchObject({ plan: "pro", subscription_id: "sub_new" });
  });
  it("downgrades on canonical payment failure even if the triggering event says invoice paid", async () => {
    await reconcileCustomer(
      stripe([subscription("past_due")]),
      team,
      "cus_demo",
      price.id,
      { token: "lease" } as BillingLease,
      { id: "evt_old_paid", type: "invoice.paid" },
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "billing_command",
      expect.objectContaining({
        p_action: "complete",
        p_data: expect.objectContaining({
          plan: "free",
          status: "past_due",
          event_id: "evt_old_paid",
        }),
      }),
    );
  });
  it("does not grant from an unrelated price or a live subscription", async () => {
    expect(
      (await canonicalSubscriptions(stripe([subscription("active")]), "cus_demo", "price_other"))
        .snapshot.plan,
    ).toBe("free");
    await expect(
      canonicalSubscriptions(
        stripe([{ ...subscription("active"), livemode: true }]),
        "cus_demo",
        price.id,
      ),
    ).rejects.toMatchObject({ code: "LIVE_MODE_DISABLED" });
  });
  it("fails closed when the subscription list is incomplete", async () => {
    await expect(
      canonicalSubscriptions(stripe([subscription("active")], true), "cus_demo", price.id),
    ).rejects.toMatchObject({ code: "BILLING_RECONCILIATION_REQUIRED" });
  });
  it("acknowledges durable duplicates but makes contention and database failures retryable", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { duplicate: true }, error: null });
    expect(await claimBilling(team, "evt_done")).toBeNull();
    mocks.rpc.mockResolvedValueOnce({ data: { busy: true }, error: null });
    await expect(claimBilling(team, "evt_pending")).rejects.toMatchObject({ status: 503 });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private diagnostic" } });
    await expect(claimBilling(team)).rejects.toMatchObject({
      status: 503,
      message: "Billing state could not be stored. Retry shortly.",
    });
  });
  it("does not acknowledge a canonical state when persistence fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    await expect(
      reconcileCustomer(
        stripe([subscription("active")]),
        team,
        "cus_demo",
        price.id,
        { token: "lease" } as BillingLease,
        { id: "evt_paid", type: "invoice.paid" },
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
