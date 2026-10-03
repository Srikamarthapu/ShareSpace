# ShareSpace v1 implementation plan

The product scope is defined by the [canonical PRD](../PRD.md); ownership is defined in [WORK_SPLIT.md](WORK_SPLIT.md). This plan sets delivery gates and evidence only. The repository is still a starter, so proposed flows are not implemented capabilities.

## Delivery gates

| Gate | Teammate 1 — web | Teammate 2 — adapters and backend | Evidence to proceed |
| --- | --- | --- | --- |
| 0. Contract and compatibility | Review shared types and states; prepare web shell and labeled fixtures | Draft the core contract; test capture and warning-injection interfaces for the installed Claude Code and Codex versions | Reviewed contract; documented agent capabilities and limits |
| 1. Accounts and connection | Sign-in, team setup, invitations, browser pairing approval | Minimal schema/RLS, team and invitation mutations, pairing, first ingestion path | Two independent accounts join; a real adapter event is visible only to authorized members |
| 2. Shared sessions | Session viewer, search, pagination, live updates and recovery; sharing/device settings | Both adapters, redaction, bounded queue, retries, revocation and read recovery | Real supported sessions appear; reconnect has no duplicates; private activity stays unshared |
| 3. Overlap warnings | Warning feed and details, evidence links, score meaning and unavailable state | Authorized context retrieval, Jev calls, validation, persistence and supported warning delivery | A deliberate overlap produces an attributable warning in the agent and dashboard; failed checks let work continue |
| 4. Retention and walkthrough | Usage and cleanup UI, deletion state, accessibility, responsive checks, Vercel and E2E | Quotas, cleanup and capacity guard, deletion/access denial, upload pausing, Supabase deployment | Integrated two-person walkthrough covers real providers, access boundaries, storage and error cases |

Teammate 2 owns the backend critical path. Teammate 1 can build against labeled fixtures while the contract and endpoints take shape. Integrate the account/connection gate before broad UI polish. Synthetic hooks do not prove compatibility with either agent.

## Completion evidence

- Two independent accounts join the same team, approve devices, and share activity from the selected repository.
- Claude Code and Codex sessions appear with capture limitations disclosed; rendered content matches events the tested adapters actually capture.
- A Jev-backed overlap warning links to supporting activity. A provider failure is visibly unavailable and does not block coding.
- Private or unlinked activity remains excluded. Revocation and membership removal deny later access and uploads. A known test secret is absent from payloads, stored content, and logs.
- Retention cleanup and upload pausing hold under concurrent uploads; deleted history does not return through caches or retries. Actual database capacity is checked separately from per-person content allowances.
- The final walkthrough verifies Vercel and Supabase together. Fixture-only checks do not satisfy real-provider acceptance.

Run `npm run check` for code changes, `npm run test:e2e` for workflow changes, and the database tests when changing migrations. Each owner supplies evidence for their area; both owners complete the final walkthrough.
