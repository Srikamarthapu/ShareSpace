import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { stripeConfig } from "@/lib/billing/stripe";
import { BILLING_LIMITS, effectivePlan } from "@/lib/billing/policy";
import { CheckoutButton } from "@/features/billing/checkout-button";
import { BillingRefresh } from "@/features/billing/billing-refresh";
export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace plan" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const client = await createSupabaseServer();
  if (!client) redirect("/login");
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: member, error: memberError } = await client
    .from("team_members")
    .select("team_id,role")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: billing, error: billingError } = member
    ? await client
        .from("team_billing")
        .select("plan,status,current_period_end,cancel_at_period_end,customer_id,updated_at")
        .eq("team_id", member.team_id)
        .maybeSingle()
    : { data: null, error: null };
  const plan = effectivePlan(billing);
  const limits = BILLING_LIMITS[plan];
  const query = await searchParams;
  const configured = !!stripeConfig();
  const unavailable = !!(memberError || billingError);
  const returned = query.checkout === "returned";
  const isAdmin = member?.role === "admin";
  return (
    <main className="standalone-page">
      <Link href="/live" className="back-link">
        ← Workspace
      </Link>
      <div className="eyebrow">WORKSPACE / BILLING</div>
      <h1>Your workspace plan.</h1>
      <div className="inline-note">
        <strong>Stripe test mode</strong>
        <p>
          This demo uses test payments only. No real money is charged. Use Stripe’s test card
          details, never a real card.
        </p>
      </div>
      {unavailable ? (
        <p className="error-text" role="alert">
          We could not verify your workspace plan. Refresh before continuing.
        </p>
      ) : (
        <section className="section-spacing">
          <h2>{plan === "pro" ? "ShareSpace Pro" : "Free workspace"}</h2>
          <p>
            {limits.members} members · {limits.repositories}{" "}
            {limits.repositories === 1 ? "repository" : "repositories"}
          </p>
          {billing && (
            <p className="muted small">
              Verified subscription status: {billing.status.replaceAll("_", " ")}
              {billing.cancel_at_period_end && billing.current_period_end
                ? ` · Cancels ${new Date(billing.current_period_end).toLocaleDateString("en-US", { timeZone: "UTC" })}`
                : ""}
            </p>
          )}
          {returned && plan !== "pro" && (
            <p className="inline-note" role="status">
              Checkout returned. Waiting for Stripe’s verified subscription update. Returning to
              this page does not activate Pro by itself.
            </p>
          )}
          {query.checkout === "cancelled" && (
            <p className="muted small">Checkout was cancelled. Your plan has not changed.</p>
          )}
          <BillingRefresh awaitingPayment={returned && plan !== "pro"} />
        </section>
      )}
      <section className="section-spacing">
        <h2>
          ShareSpace Pro <span className="muted">· $20 USD/month</span>
        </h2>
        <p>
          Up to 10 members and 5 repositories in one workspace. Test your subscription, payment
          failures, and cancellation through Stripe.
        </p>
        {!member ? (
          <p>
            Create your workspace first to try the test subscription.{" "}
            <Link href="/live">Open workspace</Link>
          </p>
        ) : !configured ? (
          <p className="inline-note">
            Test billing setup is still in progress. Your free workspace is available.
          </p>
        ) : !isAdmin ? (
          <p className="muted">A workspace admin can manage your subscription.</p>
        ) : (
          !unavailable && (
            <div className="section-spacing">
              {plan === "free" && <CheckoutButton />}
              {billing?.customer_id && <CheckoutButton portal />}
            </div>
          )
        )}
        <p className="muted small">
          Paid access changes only after a verified Stripe webhook. If you cancel or your payment
          fails, existing work stays available; adding members or repositories is limited to the
          free plan.
        </p>
      </section>
    </main>
  );
}
