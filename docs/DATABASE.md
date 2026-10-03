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

Rows that belong to a team carry `team_id`, and composite foreign keys `(x_id, team_id)` keep a child row in the same team as its parent.

Realtime publishes `sessions`, `session_events`, `overlap_checks`, and `cleanup_notices`. The SELECT policies apply to each subscriber.

## Local development and tests

The local stack uses ports 55420–55427 (see `supabase/config.toml`), so it can run next to other local Supabase projects.

```bash
supabase start
supabase db reset --local      # apply migrations
supabase test db --local       # pgTAP tests in supabase/tests/database
supabase db advisors --local
```

## Verified

On October 3, 2026, `supabase db reset --local` applied the migration, and `supabase test db --local` passed 24 access tests. `supabase db advisors --local` reported no warnings or errors. The migration has not been applied to the cloud project yet.
