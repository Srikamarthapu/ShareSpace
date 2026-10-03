# ShareSpace

**Real demo implementation.** Start with the [demo walkthrough](docs/DEMO_TEST_GUIDE.md). Read the resolved [`PRD.md`](PRD.md) and two-person [`WORK_SPLIT.md`](docs/WORK_SPLIT.md) for product context. This is a demo, not a production release.

A shared workspace for builders and their coding agents: see shared sessions, inspect recent activity, and receive advisory warnings about overlapping work.

## Run locally

Use Node 22.12+ (the repository pins 22.22.3) and npm.

```sh
npm ci
npm run dev
```

Copy `.env.example` to the ignored root `.env` and configure Supabase. Open http://localhost:3000 and sign in. The runtime uses real Supabase data and starts empty. Test fixtures live under `apps/web/test/fixtures`; they are not rendered as account data.

Turbopack disk persistence is disabled because its native cache failed on this external-volume workspace; in-memory caching remains available. The browser-test server uses Webpack. You can also run `npm run dev -- --webpack` for that local preview.

## Repository map

| Area | Starting point |
| --- | --- |
| Product requirements | [`PRD.md`](PRD.md) — single resolved v1 specification |
| Teammate ownership | [`docs/WORK_SPLIT.md`](docs/WORK_SPLIT.md) |
| Web workspace | `apps/web/src/features` — setup, invitations, devices, sharing, sessions, warnings, and storage |
| Real auth | `/login`, `/live`, `apps/web/src/lib/supabase` — email signup and sign-in |
| Local adapter | `apps/adapter` — paired, consent-gated Claude hooks and Codex wrapper |
| Shared contracts | `packages/core` — Zod schemas, state/revision guards, evidence and provider policy |
| Optional summaries | `packages/integrations` — bounded Gemini/DeepSeek helpers; no automatic capture compaction |
| Backend | `supabase` — migrations, RLS, and five deployed Edge Functions |
| Sponsor setup | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) |
| Implementation gates | [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) |
| Snapshot status | [`docs/STATUS.md`](docs/STATUS.md) |
| Combined branch verification | [`docs/MERGE_VERIFICATION.md`](docs/MERGE_VERIFICATION.md) |

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

Dependencies are pinned in package manifests and `package-lock.json`. Browser checks cover auth, themes, and empty/error states. The opt-in cloud workflow requires an ignored credentials file; see `e2e/live-cloud.spec.ts`. Further automated testing was stopped at the user's request for this demo handoff; see [`docs/REAL_DEMO_PROGRESS.md`](docs/REAL_DEMO_PROGRESS.md).

## Sponsors and external services

Supabase handles auth, RLS, team/device operations, ingestion, storage, and Jev overlap classification. Vercel hosts the web app and Stripe test billing routes. Stripe Pro is $20 USD/month in Project sandbox, with 10 members and 5 repositories. The free workspace allows 2 members and 1 repository. Google AI Studio/Gemini remains optional.

Existing shell/deployment values and `apps/web/.env.local` take precedence over the root `.env`. **Never commit environment files, real keys, device credentials, or shared transcripts.** Stripe accepts test keys and verified test webhooks only. See the [integration guide](docs/INTEGRATIONS.md) for configuration.

## Scope and trust

[`PRD.md`](PRD.md) replaces both original PRDs. Historical decisions are preserved in [`docs/DECISIONS.md`](docs/DECISIONS.md). The optional DeepSeek helper is implemented and its provider connection was checked; automatic session compaction is not connected to capture.

Every new feature uses a separate branch. Do not push or merge to `main` automatically; it requires an explicit human request for the current change. See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md).

Unavailable checks stay unknown. No task is marked complete because an agent says so. No browser action claims to resume an agent. Canonical device ingestion and preflight use Supabase Edge Functions; legacy Vercel endpoints return 410.

No open-source license has been selected. This repository is private; collaborator access is managed by its owner.
