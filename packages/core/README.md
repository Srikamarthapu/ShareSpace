# `@workspace/core`

Shared runtime contracts and deterministic domain rules for ShareSpace. Import the TypeScript source through the workspace package:

```ts
import { eventEnvelopeSchema, eventBatchSchema } from "@workspace/core";
```

The ShareSpace v1 contract is in `src/v1.ts`, with sample rows in `src/v1-fixtures.ts`. See [docs/CONTRACT.md](../../docs/CONTRACT.md). New code should use it; the schemas described below are the older starter contract.

The event schemas validate RFC UUID IDs, ISO timestamps, JSON payloads, safe relative paths, a 16 KiB serialized envelope limit, a 50-event batch limit, and a 512 KiB serialized batch limit. The batch body has the shape `{ events: [...] }`.

Preflight contracts keep code coverage separate from task-relationship findings. `deriveCodeCoverage` reports unknown when retrieval is unavailable or no source was checked. `classifyRelations` is a provider-neutral boundary: the app supplies authorized candidate evidence, and the returned candidate/evidence IDs are checked against that input. Missing providers, timeouts, provider errors, malformed responses, incomplete candidate coverage, and ungrounded findings cannot produce a clear status. Policy and coverage decisions remain application-owned; this package defines no Jev request format.

`checkResolutionAccess` enforces session binding, one-time consumption, expiry, and task/check revision matches. `transitionTaskState` enforces the lifecycle and role rules: an agent can submit work for review, a builder can accept or return it, and only an owner can pause, resume, or cancel it. `classifyEvidenceFreshness` takes its staleness window from the caller so freshness policy stays explicit.

All IDs used by these contracts are UUIDs. Authentication, project membership, database transactions, and persistence remain the server's responsibility.
