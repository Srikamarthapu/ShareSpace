# Proposed work split — review before committing to it

This is an initial proposal, pending PRD reconciliation.

## Builder A: workspace and product flow

- Own `apps/web/src/features`, UI tokens, navigation, and rendered accessibility checks.
- Replace the separate sample store with authorized queries and mutations.
- Build onboarding, invitations, settings, and check-resolution UX.
- Prove loading, empty, error, permission-change, and stale states.

## Builder B: integration and backend

- Own `apps/adapter`, `supabase`, ingestion, retrieval, and provider integration.
- Prove the exact Claude Code hook version with a real prompt and tool event.
- Add pairing, revocation, durable retry, heartbeats, and source snapshots.
- Connect Jev, validate evidence, and deliver revision-bound context.

## Shared seam

Review changes to `packages/core` together. Keep contracts small and merge them before both consumers change. Use task-sized branches and pull requests; no enforced CODEOWNERS until the teammate's GitHub handle is known.

## Decide together next

1. Reconcile the competing PRDs and select the first complete user journey.
2. Confirm which agent, repository, sponsor features, and demo flow are mandatory.
3. Decide whether Stripe is a sandbox demonstration or a product payment model; the current code implements only sandbox Checkout and receipts.
4. Decide whether Gemini summaries are useful; Jev classification and Gemini summarization are distinct boundaries.
5. Agree on ownership and acceptance criteria before extending the starter.

## First integration gate

A real submitted prompt is intercepted, a consented tool event appears for a second authenticated builder, a real evidence-backed decision is returned, and approved context reaches the actual agent. No fixture or mocked provider test satisfies this gate.
