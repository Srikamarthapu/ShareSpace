# Database

The v1 schema is the migration [`supabase/migrations/20261003212254_v1_schema.sql`](../supabase/migrations/20261003212254_v1_schema.sql). Row shapes match the shared contract in [`packages/core/src/v1.ts`](../packages/core/src/v1.ts), and [CONTRACT.md](CONTRACT.md) explains the flows. The old starter draft (`supabase/schema.sql`), with its task, source-index, resolution, handoff, and billing tables, was removed.

## Access model

- **Browser (`authenticated`):** SELECT only. RLS shows rows only to current members of the row's team (`private.is_team_member`). Cleanup notices are visible only to their own user. `public.storage_status()` returns the caller's own usage and the shared database size.
- **Edge Functions (`service_role`):** all writes. They find the actor from the user JWT or device token and check membership on every call.
- **`anon`:** no access.
- **`private` schema:** invite tokens, device-token hashes, pairing requests, and usage counters. It is not exposed through the Data API, and only `service_role` can read it.

New tables are not exposed to the Data API automatically, so the migration grants access explicitly. When you add a table, enable RLS and add grants together.

## Tables

| Table | Purpose |
| --- | --- |
| `teams`, `team_members`, `repositories` | One team per user (`unique (user_id)`), with `owner/name` repositories |
| `devices` | Paired adapters; `revoked` devices stay for history |
| `sharing_settings` | Per user per repository; no row means sharing is off |
| `sessions` | One row per agent session; removed history leaves a tombstone row |
| `session_events` | `id` is the adapter's stable event ID (deduplication); `ingest_id` is the catch-up cursor |
| `overlap_checks` | One row per prompt (`unique (trigger_event_id)`) |
| `cleanup_notices` | Tells a user that their history was removed |

## Team onboarding

Team creation, repository creation, invite lookup/rotation/preview/acceptance, and member removal all use `public.demo_api` from the canonical real-demo backend. The shared Edge Function runtime verifies the caller with Supabase Auth before passing the actor ID; a submitted user ID never grants access. The RPC is executable only by `service_role`, and checks team membership and admin role for each operation.

Invite preview is authenticated in this backend. A missing or replaced token previews as `invalid`; trying to accept a replaced token returns `invite_rotated`. The Edge Function platform JWT check remains off because the shared runtime validates user tokens itself and also accepts scoped adapter credentials on the other functions.

`public.demo_api` reads `private.team_plan_limits` when accepting an invite or adding a repository. Free teams remain limited to two members and one repository; an active, current test Pro subscription raises those limits to ten members and five repositories. Member removal revokes their approved devices and removes their sharing settings.

Rows that belong to a team carry `team_id`, and composite foreign keys `(x_id, team_id)` keep a child row in the same team as its parent.

Realtime publishes `sessions`, `session_events`, `overlap_checks`, and `cleanup_notices`. The SELECT policies apply to each subscriber.

## Local development and tests

The local stack uses ports 55420–55427 (see `supabase/config.toml`), so it can run next to other local Supabase projects.

```bash
supabase start
supabase db reset --local      # apply migrations
supabase test db --local       # pgTAP tests in supabase/tests/database
supabase db advisors --local
supabase functions serve       # Edge Functions at http://127.0.0.1:55421/functions/v1
```

To use the local stack from the web app, set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from `supabase status`) in the root `.env`.

## Verified

The teammate 2 checkpoint records that on October 3, 2026, `supabase db reset --local` applied the migration, `supabase test db --local` passed 24 access tests, and `supabase db advisors --local` reported no warnings or errors.

The combined-branch verification independently applied the migration and passed all 24 pgTAP assertions in an isolated Supabase PostgreSQL 17.6.1.134 container. Test identities now set matching individual/JSON JWT claims for compatibility with both `auth.uid()` helper variants; anon clears both. The local CLI launchers exited 137, so that verification did not run the CLI or advisors. See [MERGE_VERIFICATION.md](MERGE_VERIFICATION.md) for scope and limitations. This merge does not apply the migration to the cloud project.

The teammate onboarding branch recorded a local run of 48 database assertions, clean advisors, and a two-account invite flow. That run exercised its separate direct-database `private.*` RPC implementation, which this merge removes because it duplicated the deployed API and did not enforce paid-plan limits. It is historical evidence for that branch, not verification of the merged backend. The canonical onboarding operations are already in `real_demo.test.sql`; no additional schema migration is needed for those operations. This merge does not apply DDL to the cloud project.
