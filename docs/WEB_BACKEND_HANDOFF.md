# Web and backend integration handoff

This note records the minimum contract Teammate 1 needs from Teammate 2 to connect browser flows to the ShareSpace v1 backend. It derives requirements from the [PRD](../PRD.md) and [ownership split](WORK_SPLIT.md); it does not choose endpoint names, payload shapes, or database types.

## Current boundary

- The browser must use the authenticated Supabase user for RLS-protected reads and authorized Realtime subscriptions. Current user-scoped reads remain separate from the sample workspace.
- Privileged mutations, ingestion, and Jev execution belong in Supabase Edge Functions. Teammate 1 must not recreate those operations or membership policy in Next.js routes.
- `/live` and `GET /api/projects` currently provide only authenticated project listing (`id`, `name`). `POST /api/agent/events` returns `503 DEVICE_INGESTION_NOT_READY`; `POST /api/agent/preflight` returns `503 PREFLIGHT_NOT_READY`.
- `packages/core/src/contracts.ts` defines a bounded event envelope and batch, but not read pagination, acknowledgements, Realtime recovery, pairing, warning, or storage contracts. Its preflight types describe task/source evidence and cannot stand in for the PRD's session-overlap warning result.
- `supabase/schema.sql` is an unapplied draft. The connected project had no public tables, functions, or migrations on October 3, 2026. UI flows therefore remain fixture-backed until a reviewed backend contract and deployment exist.

## Contract decisions needed before wiring UI

Teammate 2 should publish these decisions in the shared core contract and its matching fixtures. Keep the contract small and versioned; browser code should consume the settled contract rather than infer behavior from table names.

1. **Identity and scope:** team, repository, session, event, warning, and device identifiers; fields visible to members; owner/admin/member abilities; how each operation derives the authenticated actor; and how current membership and repository scope are rechecked. Submitted user IDs, repository names, or slugs must not authorize access.
2. **Setup and invitations:** supported team/repository setup, member listing/removal, and reusable invitation lifecycle; which user can create, rotate, accept, and revoke; and how rotation invalidates old links while preserving existing membership.
3. **Pairing and devices:** browser approval states, repository-scoped device credential lifecycle, device metadata visible to the browser, independent revocation, expiry/recovery behavior, and distinct browser identity versus adapter credential failure states. Credential material must not be returned in normal device reads or written to logs.
4. **Sharing and privacy:** repository opt-in state, per-session shared/paused/private behavior, how a pause immediately stops new capture and queued uploads, and how changing the repository default affects future sessions. State whether already stored history remains available until a separate deletion action.
5. **Session reads:** session summary fields and capture limitations; event fields and supported kinds; stable ordering, cursor/page-size limits, filtering, event links, and deleted/removed-history behavior. Define authorized Realtime notifications and the persisted read needed to recover missed updates. Reconcile the existing 16 KiB envelope and 50-event/512 KiB batch starting limits with adapter and backend limits.
6. **Ingestion outcomes:** stable identity and deduplication rules, acknowledgement content, sequence/cursor behavior, retry safety, and distinct outcomes for transient failure, revoked membership/device, private or paused sharing, and storage refusal. Deletion or revocation must not allow queued retries to resurrect content.
7. **Overlap checks:** distinguish a completed check with no overlap, an overlap warning, and unavailable/failed evidence; include authorized supporting session/event references and related-session navigation; make retry idempotency clear; and define any numeric model score's meaning before the UI labels or displays it. Missing evidence and score remain unknown/unavailable.
8. **Usage, cleanup, and deletion:** report accounted user content and aggregate database capacity separately; provide warning/pruning/upload-paused states and removal notices; explain active-session protection and oldest-first eligibility; define owner deletion and how related content, caches, links, and pending retries are invalidated. Distinguish quota refusal from transient failure so the local queue stays bounded.
9. **Errors and fixtures:** publish stable, user-safe outcomes for loading, empty, partial capture, access revoked, unavailable, history removed, and storage paused. Provide sanitized fixtures covering each outcome without placing sample data in real-account views.

## Browser integration acceptance

Before wiring a live view, Teammate 1 should be able to verify its contract and fixture against the reviewed core schema, and Teammate 2 should have deployed the matching migration or Edge Function. Then confirm:

- reads and Realtime updates expose only current member-visible repository/session data;
- a missed notification is recovered by a persisted read with stable ordering and pagination;
- each privileged action is authorized server-side and reports its defined state;
- revoked access, private/paused sharing, deletion, and storage refusal appear as distinct UI states;
- retry, pruning, and removal cannot duplicate or restore deleted history;
- fixture UI remains visibly separate from real account data.

No UI should present a fixture as a live event, warning, device, quota measurement, or successful deletion. See [`T1_PROGRESS.md`](T1_PROGRESS.md) for release status.
