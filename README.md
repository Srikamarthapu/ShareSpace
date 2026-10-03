# ShareSpace

**Work-in-progress foundation.** Read the resolved [`PRD.md`](PRD.md), the two-person [`WORK_SPLIT.md`](docs/WORK_SPLIT.md), and the [`BUILD_PLAN.md`](docs/BUILD_PLAN.md). The code remains a starter, not a completed product, live agent integration, or production release.

A shared workspace for builders and their coding agents: see shared sessions, inspect recent activity, and receive advisory warnings about overlapping work.

## Run locally

Use Node 22.12+ (the repository pins 22.22.3) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The labeled sample workspace needs **no credentials**. The dashboard and transcripts use synthetic sessions for Claude Code and Codex. Setup, invitations, device and sharing preferences stay in browser local storage. Session history is synthetic, with local controls to exercise paging, reconnect, and deletion states. It never reads local conversations or contacts a provider.

Turbopack disk persistence is disabled because its native cache failed on this external-volume workspace; in-memory caching remains available. The browser-test server uses Webpack. You can also run `npm run dev -- --webpack` for that local preview.

## Repository map

| Area | Starting point |
| --- | --- |
| Product requirements | [`PRD.md`](PRD.md) — single resolved v1 specification |
| Teammate ownership | [`docs/WORK_SPLIT.md`](docs/WORK_SPLIT.md) |
| Web workspace | `apps/web/src/features` — setup, invitations, devices, sharing, sessions, warnings, and storage |
| Real auth | `/login`, `/live`, `apps/web/src/lib/supabase` — separate from the sample store |
| Local adapter | `apps/adapter` — consent-gated hook normalization, privacy filters, dry-run CLI |
| Shared contracts | `packages/core` — Zod schemas, state/revision guards, evidence and provider policy |
| Optional Gemini | `packages/integrations` — bounded, explicitly approved context summaries |
| Database | `supabase` — staged schema and access-control foundation; see its status before applying |
| Sponsor setup | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) |
| Implementation gates | [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) |
| Snapshot status | [`docs/STATUS.md`](docs/STATUS.md) |

## Commands

```sh
npm run typecheck
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
npm run adapter -- --help
```

Dependencies are pinned in package manifests and `package-lock.json`. Browser tests cover the sample dashboard on desktop and mobile Chromium, including filters, transcript navigation, accessibility, and horizontal overflow. They start a local server automatically; set `PLAYWRIGHT_BASE_URL` to reuse a running preview. The GitHub workflow runs the same checks on branch pushes and pull requests. Live multi-user verification remains a separate integration gate; see [`docs/T1_PROGRESS.md`](docs/T1_PROGRESS.md).

## Sponsors and external services

Supabase auth/data, Vercel deployment configuration, and Stripe sandbox Checkout/webhook foundations are included. All Stripe/billing work is deferred until after v1; the existing scaffold is outside the first-version acceptance path. Google AI Studio/Gemini is optional. The PRD’s Jev decision boundary remains separate; no Jev API or successful provider result is invented.

Copy `apps/web/.env.example` to `apps/web/.env.local` only when configuring real services. **Never commit that file, real keys, device credentials, or shared transcripts.** The existing ShareSpace Supabase project and a Vercel preview project are configured. GitHub OAuth and the teammate 2 backend still need their integration gate; see [`docs/WEB_RELEASE.md`](docs/WEB_RELEASE.md). Stripe is restricted to sandbox keys and sandbox receipts; no paid plan or production entitlement is implemented.

## Scope and trust

[`PRD.md`](PRD.md) replaces both original PRDs. Historical decisions are preserved in [`docs/DECISIONS.md`](docs/DECISIONS.md); the originals remain in Git history. DeepSeek summarization is a proposed optional extension, not a required or verified v1 integration.

Every new feature uses a separate branch. Do not push or merge to `main` automatically; it requires an explicit human request for the current change. See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

Sample findings are labeled fixtures. Unavailable checks stay unknown. No task is marked complete because an agent says so. No browser action claims to resume an agent. Device ingestion and preflight endpoints currently fail closed with explicit 503 responses.

No open-source license has been selected. This repository is private; collaborator access is managed by its owner.
