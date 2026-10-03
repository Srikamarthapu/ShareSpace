# ShareSpace v1 ownership and collaboration

The [canonical PRD](../PRD.md) defines product scope. This document assigns implementation ownership and repository boundaries; an ownership entry does not approve a feature outside that PRD. Teammate numbers are roles, not named GitHub accounts.

## Ownership by capability

| Capability | Teammate 1 — web product | Teammate 2 — adapters and backend |
| --- | --- | --- |
| Login and setup | Sign-in/callback UI, browser session handling, team and repository setup screens | Supabase Auth, schema, membership enforcement, setup mutations |
| Invitations | Create, copy, rotate, join screens and member management | Generate, rotate and accept invite links; authorize membership changes |
| Agent connection | Setup guidance, browser pairing approval, device list and revocation controls | CLI pairing, repository-scoped credentials, secure local storage, backend verification and revocation |
| Sharing | Repository opt-in, pause/private controls and clear sharing indicators | Enforce sharing scope locally and server-side; exclude private and unlinked sessions |
| Shared sessions | Dashboard/transcript, session-local search, pagination, live updates and event details | Claude Code/Codex capture, normalization, redaction, bounded retries, idempotent ingestion and ordered reads |
| Overlap warnings | Warning feed, score/context presentation, related-session links and unavailable states | Authorized context retrieval, Jev calls, result validation, persistence and supported agent-context delivery |
| Retention and deletion | Usage display, cleanup notices, removed-history state, upload-paused state and deletion UI | Byte accounting/reservations, oldest-first cleanup, related-content deletion and actual database-capacity guard |
| Release and QA | Vercel, browser/E2E tests, accessible responsive UI and root CI coordination | Supabase deployment/migrations, database/RLS tests, adapter/provider tests and service configuration |

## Folder ownership

| Area | Owner and boundary |
| --- | --- |
| `apps/web/**`, web auth/session code, browser Supabase helpers, UI tests and Vercel configuration | Teammate 1 |
| `apps/adapter/**`, including adapter tests and documentation | Teammate 2 |
| `supabase/**`, including migrations, Edge Functions, cleanup jobs and database tests | Teammate 2 |
| `packages/integrations/**`, including Jev | Teammate 2 |
| `packages/core/**` | Teammate 2 drafts contracts; both review the contract before dependent consumer work |
| Root scripts, dependencies, `package-lock.json` and CI shared by both | One change at a time; affected owners review before integration |
| Shared scope/build documents | One editor per change; both owners review scope changes |

Teammate 1 builds the browser product and deployment. Teammate 2 owns adapter capture, data, authorization and backend execution. Browser reads use user-scoped RLS and authorized Realtime subscriptions; privileged mutations and application API behavior use Supabase Edge Functions. Do not duplicate ingestion, Jev calls or membership policy in Next.js routes, or build duplicate web screens in the adapter/backend area.

## Shared contract

Teammate 2 proposes the small `packages/core` contract; teammate 1 reviews it as the browser consumer. Review and settle that contract before dependent clients change. Keep endpoint names, identity rules and event semantics in the shared contract instead of inventing them independently in each consumer.

The contract should define:

1. Team, repository and session identifiers; authenticated identity; and fields visible to members. A submitted user or project ID never proves authorization.
2. Pairing, browser approval, credential scope, revocation and failure states. Browser identity and adapter credentials are separate.
3. Bounded event types and content, stable IDs, occurrence and receipt times, ordering/cursor rules, tool/result correlation, redaction and truncation markers, and capture capabilities.
4. Batch acknowledgements, retry and deduplication, pagination and Realtime notifications. Persisted reads recover missed history.
5. Check outcomes for warnings, completed checks with no overlap, and unavailable checks; supporting session/event references; optional score fields with verified meaning. Missing evidence remains unknown.
6. Sharing/deletion behavior, retention notices, accounted usage, removed-history behavior and upload-paused outcomes. Distinguish quota rejection from transient retry so local queues remain bounded.
7. A typed web client and matching fixtures. Fixtures remain visibly labeled and isolated from real-account data.

## Scope and collaboration rules

- Stripe and all billing work are deferred until after v1 works. Do not add checkout, subscriptions, webhooks, billing pages, pricing, upgrade prompts, billing entitlements or billing tests to the v1 acceptance path.
- DeepSeek summarization of oversized outputs remains a proposed optional approach, not an approved feature or acceptance requirement. Bounded excerpts remain the fallback; do not allocate implementation work until the proposal is approved.
- Source indexing, a task board, negotiated resolutions/continuation packets, multiple teams, Cursor, heartbeats, automated personal-content screening and Gemini remain outside the current v1 scope as recorded in the PRD.
- Give each new feature its own task-sized branch. Do not push or merge to `main` automatically; update `main` only when the human explicitly requests it for the current change.
- Keep changes in the other owner's area out of a branch unless the shared contract or a reviewed integration requires them. Coordinate those seams with the affected owner.
- Root dependency/script and lockfile changes happen one at a time, with review from each affected owner. Keep schema changes with teammate 2 to avoid competing migrations.
