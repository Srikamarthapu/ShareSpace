# Sponsor integration foundations

These are code foundations, not claims of live account setup or end-to-end verification.

Use [PRD.md](../PRD.md) for the resolved v1 scope. It places the application backend in Supabase Edge Functions and requires both Claude Code and Codex. Stripe/billing is deferred until after v1; the sandbox instructions below describe existing scaffolding, not current build work. Gemini and the proposed DeepSeek summaries are optional.

## Supabase

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `apps/web/.env.local`. The server uses verified auth, cookie refresh, and user-scoped queries. `/login` supports existing accounts; `/live` reads real projects. Project creation, invitations, device authorization, and connecting the collaborative UI remain pending.

The database work is documented in `DATABASE.md` when present. Review its migration/test status before applying to an external project. No existing cloud database was changed.

## Vercel

Import this private GitHub repository into Vercel and set **Root Directory: `apps/web`**. Enable inclusion of source files outside the root directory so npm workspaces can resolve `packages/*`. `apps/web/vercel.json` runs install/build from the monorepo root. Use separate development/preview/production variables, and set `APP_URL` to the exact deployment origin when using Stripe. No deployment has been created or verified yet.

Official reference: [Vercel monorepos](https://vercel.com/docs/monorepos).

## Stripe sandbox

The optional `/live/billing` page uses authenticated hosted Checkout for a server-configured **one-time sandbox Price**. This is an isolated integration exercise, not a selected business model or paid-access plan.

1. Create an isolated Stripe sandbox and a one-time Price there.
2. Prefer a restricted sandbox key with Prices read and Checkout Sessions write permissions. Set `STRIPE_SECRET_KEY` and `STRIPE_SANDBOX_PRICE_ID` server-side.
3. Set `APP_URL` to your exact origin. Local HTTP is allowed only for localhost/127.0.0.1. Checkout rejects cross-origin requests and requires an idempotency UUID.
4. Set the server-only `SUPABASE_SECRET_KEY` to a Supabase secret/legacy service-role key; the webhook uses it only after signature verification. Apply the sandbox-payment schema and RPC first.
5. Forward Stripe events with the Stripe CLI to `http://localhost:3000/api/billing/webhook`; set the resulting `STRIPE_WEBHOOK_SECRET`.
6. Test `checkout.session.completed` and `checkout.session.async_payment_succeeded`. A paid sandbox event with matching app metadata creates an idempotent receipt. Unpaid or unrelated events do not fulfill anything. Database failure requests a retry.

No payment is inferred from a success URL. No live keys are accepted. No production entitlement, subscription, refund workflow, taxes, or price has been defined. Production payment work needs a separate product decision and implementation.

Official references: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [signed webhooks](https://docs.stripe.com/webhooks), [sandboxes](https://docs.stripe.com/sandboxes).

## Optional Google AI Studio / Gemini

`packages/integrations` contains a server-only helper using the official Google Gen AI SDK. It requires an explicit caller approval flag, bounded authorized context, a server-only key, and a chosen model ID. Output is schema-checked and its evidence IDs must be present in the input.

`GEMINI_API_KEY` and `GEMINI_MODEL` are reserved configuration entries; **no UI/API route currently invokes the helper**. Do not wire it before implementing membership checks and explicit consent. Missing credentials, invalid output, and timeouts return unavailable. Tests use mocks; no real Gemini call has been verified.

Official references: [Google Gen AI libraries](https://ai.google.dev/gemini-api/docs/libraries), [SDK](https://github.com/googleapis/js-genai).

## Jev and Claude Code

The PRD's classification provider stays behind shared typed contracts; a real Jev SDK integration is pending. The local Claude Code adapter is preview-only and does not prove installed-version compatibility, streaming, preflight interception, or context delivery. See `apps/adapter/README.md` before opting into any hook configuration.
