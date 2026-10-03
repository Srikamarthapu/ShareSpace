# ShareSpace test subscriptions

This implementation accepts test keys and test webhook events only. Hosted Checkout uses the configured active recurring price, and validates exactly USD 2,000 cents per month. No Stripe browser key is required.

Server configuration:

- `STRIPE_SECRET_KEY`: test restricted key (`rk_test_…`) with customer, Checkout Sessions, subscription read, price read, and customer portal access, or a test secret key. Store as a sensitive server environment variable.
- `STRIPE_SANDBOX_PRICE_ID`: the single configured USD $20/month test price.
- `STRIPE_WEBHOOK_SECRET`: signing secret for `/api/billing/webhook` on this deployment.
- `APP_URL`: exact HTTPS application origin, or localhost HTTP for local testing.
- `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`: server database connection.

The Stripe customer portal configuration must enable cancellation and payment method updates. Leave product/price/quantity changes disabled for the demo's single fixed plan. Subscribe the webhook to `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. Webhook delivery must reach the application without Vercel deployment protection blocking Stripe.

Checkout and portal resolve the team from the authenticated Supabase user and require its admin role. Neither accepts a client-selected price or team. `public.team_billing` is member-readable with no browser writes. Ownership is the unique stored Stripe customer ID; webhook metadata cannot assign an entitlement.

`public.billing_command` is service-role only. It uses a 90-second fenced lease to serialize customer creation, Checkout creation, and webhook reconciliation per team. Checkout request IDs are persisted before Stripe calls. A canonical Stripe subscription list, with latest invoices expanded, is fetched under the lease for every lifecycle event. That snapshot and the durable event ID are committed atomically. Retries after a database/provider failure remain retryable; a committed duplicate is acknowledged. A stale lease cannot overwrite a newer worker's state.

Pro requires an active, test-only subscription containing exactly one configured price at quantity one, a paid latest invoice, and a future period end. Trialing, failed, cancelled, or expired subscriptions do not grant paid capacity. A scheduled cancellation keeps access until period end. `private.team_plan_limits(uuid)` returns `{"members":2,"repositories":1}` for free and `{"members":10,"repositories":5}` for verified Pro. Backend create/join operations enforce those caps; existing work is retained after downgrade.

The Checkout return page never grants access. It polls the database-backed billing page for up to 90 seconds and provides a manual refresh button. Canonical refresh handles delayed and reordered event payloads; failed deliveries can be retried from Stripe Workbench. The private event ledger contains IDs/types only, not payment payloads or card details.

This is a test integration, not authorization to accept real payments. Before a real-money release, independently review Stripe Tax registrations and recurring-tax configuration, privacy/legal copy, failed-payment grace policy, monitoring, and production credentials. Automatic tax is intentionally not enabled here.
