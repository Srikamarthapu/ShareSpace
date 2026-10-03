# Database foundation (WIP)

Use [PRD.md](../PRD.md) for the resolved v1 product scope. This database draft predates reconciliation and contains deferred task, source-index, resolution, handoff, and billing tables. Their presence does not make those features required; reconcile the schema through tested migrations before implementing v1.

The database starter is authored in [supabase/schema.sql](../supabase/schema.sql). Supabase applies only files in supabase/migrations/; this draft still needs to be moved into a filename created by the CLI command supabase migration new workspace_foundation. The installed /opt/homebrew/bin/supabase process is terminated by macOS (exit 137) for --version, init, and migration new. Docker's daemon is unavailable. The local config is handwritten and the schema is not yet applied or CLI-validated.

No cloud project or cloud migration is part of this starter. The seed file is empty. Once the CLI works and the schema is promoted to a migration, run supabase start, supabase db reset, and supabase test db locally.

## Schema and trust boundaries

The public schema contains organizations, memberships, projects, invitations, device metadata, sessions, events, tasks, task revisions, source snapshots/chunks, checks, findings, resolutions, handoffs, coordination messages, audit events, billing event receipts, and sandbox payment records. Every project-scoped row carries organization and project IDs and uses composite foreign keys to enforce scope.

Invitation and device token hashes live in private.invitation_secrets and private.device_credentials, outside the configured Data API schemas. Public invitation/device rows contain metadata only. billing_events stores event ID/type, checkout session ID, and receive time; it stores no raw Stripe payload. record_sandbox_payment(...) is invoker-rights, idempotent, accepts only checkout.session.completed / checkout.session.async_payment_succeeded and cs_test_ sessions, and is executable only by service_role. The webhook route must verify Stripe's signature, paid status, and livemode = false before calling it. This is a sandbox receipt foundation, not production billing or entitlement logic.

Authenticated users have read grants only, with row-level security limiting organizations/projects to current members, session content to its owner or teammates when shared, and sandbox payment rows to their owning user. Owners still cannot read another user's private session. Pausing sharing stops future capture in the endpoint while existing shared rows remain visible. Credentials, resolutions, handoff context packets, and billing event receipts have no authenticated read grant. Mutations remain future server transactions using service_role; keep that key server-only and validate user, device, and project scope before every write.

Private helper functions use a fixed empty search path and derive the actor only from auth.uid(). They prevent recursive membership RLS. The private schema is omitted from the API schema list. Data API grants and RLS are separate controls; preserve both when adding tables.

## Deferred transactions and behavior

The schema does not implement atomic organization/first-owner/project creation, invite consumption/revocation, device pairing/rotation/revocation, bounded redacted ingestion, task intent registration, active-intent revision comparison, resolution consumption, last-owner protection, or account/session cleanup. Build each as a short server transaction. Do not hold a database lock while waiting for a model. Scope changes need immutable task revisions; overlap alerts deduplicate by ordered task pair and both revisions. Membership removal must revoke devices in the same transaction. Physical deletion must remove derived snippets/context and account for backups; a tombstone is not complete deletion.

Realtime channel authorization is separate. Broadcast minimal IDs/revisions and fetch sensitive content through an endpoint that rechecks current membership and sharing.

## Verification

Schema application, CLI config validation, pgTAP, and local integration tests remain unverified. The available CLI exits 137 before startup, and Docker is unavailable. Current Supabase guidance checked: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [API security](https://supabase.com/docs/guides/api/securing-your-api), and [database testing](https://supabase.com/docs/guides/local-development/testing/overview). The 2026-09-25 PostgreSQL breaking notice concerns ltree, btree_gist, and legacy pgcrypto encryption; this schema uses none of those extensions.
