# ShareSpace

**Work-in-progress foundation.** This initial snapshot is being shared before the team reconciles competing PRDs. It is not the completed product, a live agent integration, or a production release.

A shared workspace for builders and their coding agents: see current intent, inspect intentionally shared work, compare overlapping requests, and carry approved context into the next prompt.

## Run locally

Use Node 22.12+ (the repository pins 22.22.3) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The labeled sample workspace needs **no credentials**. Sample tasks, decisions, and preferences stay in browser local storage. Reset them in Settings. It never reads local conversations or contacts a provider.

## Repository map

| Area | Starting point |
| --- | --- |
| Web workspace | `apps/web/src/features` — overview, sessions, coordination, connection guidance, settings |
| Real auth | `/login`, `/live`, `apps/web/src/lib/supabase` — separate from the sample store |
| Local adapter | `apps/adapter` — consent-gated hook normalization, privacy filters, dry-run CLI |
| Shared contracts | `packages/core` — Zod schemas, state/revision guards, evidence and provider policy |
| Optional Gemini | `packages/integrations` — bounded, explicitly approved context summaries |
| Database | `supabase` — staged schema and access-control foundation; see its status before applying |
| Sponsor setup | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) |
| Work split / open decisions | [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) |
| Snapshot status | [`docs/STATUS.md`](docs/STATUS.md) |

## Commands

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm run adapter -- --help
```

Dependencies are pinned in package manifests and `package-lock.json`. Browser E2E configuration, GitHub CI, and live multi-user verification are still pending in this snapshot.

## Sponsors and external services

Supabase auth/data, Vercel deployment configuration, and Stripe sandbox Checkout/webhook foundations are included. Google AI Studio/Gemini is optional. The PRD’s Jev decision boundary remains separate; no Jev API or successful provider result is invented.

Copy `apps/web/.env.example` to `apps/web/.env.local` only when configuring real services. **Never commit that file, real keys, device credentials, or shared transcripts.** Cloud resources have not been provisioned by this snapshot. Stripe is restricted to sandbox keys and sandbox receipts; no paid plan or production entitlement is implemented.

## Scope and trust

The original `Builder_Collaboration_Workspace_PRD.pdf` supplied on October 3, 2026 informed this draft. Its build instructions are source material, not completed acceptance gates. The team will reconcile product requirements before implementation continues.

Sample findings are labeled fixtures. Unavailable checks stay unknown. No task is marked complete because an agent says so. No browser action claims to resume an agent. Device ingestion and preflight endpoints currently fail closed with explicit 503 responses.

No open-source license has been selected. This repository is private; collaborator access is managed by its owner.
