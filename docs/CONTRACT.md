# ShareSpace v1 contract

The code is the source of truth: [`packages/core/src/v1.ts`](../packages/core/src/v1.ts). Sample rows for every UI state are in [`v1-fixtures.ts`](../packages/core/src/v1-fixtures.ts) as `V1_SAMPLE`. This page explains the flows. It answers the nine items in [WEB_BACKEND_HANDOFF.md](WEB_BACKEND_HANDOFF.md) on the teammate 1 branch.

Status: draft for teammate 1 review. Nothing here is deployed yet.

## Access rules

- **Reads:** the browser reads tables with the signed-in user's Supabase client. RLS returns only rows from the user's current team. Row schemas (`*RowSchema`) use the database column names.
- **Writes:** every change is `POST /functions/v1/<name>` with an `action` field. The functions are `teams`, `devices`, `sharing`, `ingest` and `overlap-check`.
- **Who is acting:** the browser sends its user JWT. The adapter sends its device token in the `x-sharespace-device-token` header. The function finds the actor from that credential and checks current membership every time. A user ID in a request body never grants access.
- **Errors:** every non-2xx response is `{ error: { code, message, retry_after_ms? } }`. The codes are in `apiErrorCodeSchema`.

## Teams and invitations (`teams`)

One team per user in v1. `create_team` makes the team and its one repository (`owner/name`), and the creator becomes admin. An admin can use `get_invite` to copy the current link and `rotate_invite` to make a new one. Rotating stops the old link but keeps all members. `preview_invite` returns `valid`, `rotated` or `invalid`. `accept_invite` is safe to repeat. `remove_member` also revokes that member's devices. The last admin cannot be removed.

## Pairing a device (`devices`)

This works like signing in a TV with a code.

1. The adapter calls `start_pairing` with the agent, device name, repository and capabilities. It gets back a `user_code` (like `WXYZ-2345`), an `approve_url`, a `poll_secret` and an expiry.
2. The adapter shows the code and opens `approve_url` in the browser.
3. The browser calls `get_pairing`, shows the request, and calls `approve_pairing` or `reject_pairing`. Approval works only if the repository is in the user's team.
4. The adapter calls `poll_pairing` until the status is not `pending`. On `approved`, it gets the device token **once**, and the token is never shown again.
5. Only the device owner can call `revoke_device`. A revoked device gets `device_revoked` on its next request.

Only a hash of the device token is stored. Device rows that team members can read never contain token material.

## Sharing and privacy (`sharing`)

- `set_sharing` turns sharing on or off and pauses or resumes it, per user per repository. No row means sharing is off.
- `set_session_visibility` with `private` makes one session stop accepting new events.
- `delete_session` removes the session's events and the warning excerpts that quote it. The session row stays as a tombstone, so old links show "History removed".
- These changes affect **future** capture only. History that is already shared stays until the owner deletes it.

## Sessions and events (reads)

- `sessions` holds one row per agent session. Its fields include `title`, `latest_prompt`, `branch`, `touched_paths`, `capture_limitations`, `last_activity_at` and the removed-history fields.
- `session_events` holds one row per event. Each `kind` has a fixed `payload` shape. `eventRole(kind)` gives the transcript role: `user`, `assistant`, `tool` or `system`. A `tool.started` event with no matching `tool.completed` (same `tool_call_id`) shows as `running`.
- **Display order:** `(sequence, occurred_at, id)`. `sequence` comes from the adapter, so a late retry appears where it happened, not as new work.
- **Paging:** page by `sequence`. The default page is 50 events and the maximum is 100.
- **Live updates:** subscribe with Realtime to `sessions`, `session_events`, `overlap_checks` and `cleanup_notices`. Realtime is only a hint, and persisted reads are the truth. `ingest_id` is sequence allocation order, not commit order: a lower ID can become visible after a higher one. An exclusive `ingest_id > last seen ingest_id` query alone can therefore miss committed events. Before wiring live recovery, the ingest/read implementation must settle a commit-safe cursor or persisted reconciliation strategy and test concurrent out-of-order commits. This migration does not yet provide that guarantee.

## Ingest (`ingest`, adapter)

The adapter sends batches of 1–50 events (each event at most 16 KiB, each batch at most 512 KiB). Every event has a stable `event_id`, so a retry returns `duplicate`, not a second copy. The response lists each event as `accepted`, `duplicate` or `rejected` (with a code), plus the current sharing and storage state.

A failed batch maps to one action through `ingestFailureAction(code)`:

| Action | Codes | What the adapter does |
| --- | --- | --- |
| `retry` | `unavailable`, `rate_limited`, `internal` | Keeps the batch and retries later |
| `drop_batch` | `invalid_request`, `payload_too_large` | Drops this batch and keeps going |
| `drop_queue` | revoked, not a member, sharing off or paused, storage paused | Stops and clears the queue; never flushes it later |

The local queue is limited to 1,000 events or 2 MB, and the oldest events are dropped first.

## Overlap checks (`overlap-check`, adapter)

When the user submits a prompt, the adapter sends the prompt (already redacted) and its `user.message` event ID. The response `outcome` is one of these:

- `warning`: at least one `overlapping` finding.
- `no_overlap`: the check finished. There can still be `related` findings.
- `unavailable`: the check did not finish (`timeout`, `provider_error`, and so on). The agent shows "Overlap check unavailable — continuing." and keeps working.
- `not_applicable`: the prompt is not an implementation request. Nothing is stored.

`agent_context` is text that the adapter gives the coding agent. For implementation requests, it tells the agent to search the local repository for an existing implementation. Retrying with the same `event_id` returns the same check.

A finding's `score` is the raw Jev value from 0 to 1, and its meaning is not verified. Label it "Model score". Do not show it as a percentage or as accuracy. Stored checks (`overlap_checks`) are visible to the whole team.

## Storage (`storage_status()` and `cleanup_notices`)

The database function `storage_status()` returns the user's accounted bytes and the shared database size **separately**. Each has a state: `ok`, `warning`, `cleanup`, `paused` or `unknown`. `unknown` is never treated as free space. The thresholds (decimal MB) are in `STORAGE_LIMITS`: 50 MB per-person limit, a warning at 40 MB, cleanup down to 30 MB, a database warning at 350 MB, and an upload pause at 400 MB. When history is pruned or deleted, the owner gets a `cleanup_notices` row.

## Changes from the teammate 1 sample types

| Sample type | Contract | Why |
| --- | --- | --- |
| `"Claude Code"`, `"Codex"` | `claude_code`, `codex`, with `AGENT_LABELS` for display | Stable values in the database |
| Repository `name` or `owner/name` | Always `owner/name` | The adapter matches it to the git remote |
| Invite state `full` | Removed | Member limits are a later billing decision |
| Capability `partial` or `unsupported` | Adds `supported` | Some capabilities do work |
| Storage scenarios | Adds `ok` | The normal state |
| Pairing status | Adds `expired` | Codes time out |
| Event `role`, `title` | `kind` + `eventRole()`; the UI chooses titles | One source for the role |

## Not in v1

The older `preflight`, `task`, and `resolution` types in `contracts.ts` belong to features outside the v1 scope. Do not build on them. They will be removed once the adapter moves to `ingestEventSchema`.
