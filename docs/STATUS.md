# Snapshot status — October 3, 2026

The user requested an immediate repository checkpoint before reconciling competing PRDs. This document describes that initial snapshot, not release completion. The resolved product specification is [PRD.md](../PRD.md); ownership is in [WORK_SPLIT.md](WORK_SPLIT.md), delivery gates in [BUILD_PLAN.md](BUILD_PLAN.md), and the historical discussion in [DECISIONS.md](DECISIONS.md). Planning updates have not implemented those features.

## Present

- Next.js / TypeScript npm-workspace structure and pinned lockfile.
- Labeled sample workspace, tasks, session search/filtering, check comparison, local sample resolutions, connection guidance, settings, and build guide.
- Separate Supabase auth and authenticated project-read foundation.
- Shared bounded contracts, state/revision guards, and provider validation.
- Local opt-in adapter/privacy foundation.
- Stripe sandbox Checkout, signature-verified webhook, and receipt foundation.
- Optional Gemini helper with consent and bounded input/output.
- Vercel monorepo configuration.

## Not claimed

- Completed PRD, live multi-user collaboration, production security readiness.
- Proven Claude Code integration, Jev integration, source indexing, device pairing, durable ingestion, or agent continuation.
- Provisioned Supabase/Stripe/Google/Vercel accounts, live provider calls, deployment, or teammate access.
- Browser/E2E or visual verification. UI code has not yet been rendered during this checkpoint.
- Automated CI or a finalized ownership/branch policy.

## Verification

- `npm run typecheck`: passed across all four workspaces.
- `npm test`: passed, 30 tests across 6 files, covering shared contracts/policy, adapter privacy, Gemini mocks, request limits, sample state, and Stripe signatures/receipt gating.
- `npm run lint`: passed with one export-style warning, then that warning was corrected.
- Production build and browser/E2E checks: not run before this user-requested checkpoint.
- SQL/RLS tests and live external-service tests: not run. `supabase/schema.sql` is a draft, not a CLI-generated or applied migration.

No fixture test counts as live integration proof.

## Dependency note

The current install reports a high-severity `braces` advisory through Next's ESLint tooling (`micromatch` / `fast-glob`). It is a development dependency path, not a verified production exploit. The npm-proposed automatic fix downgrades the Next ESLint configuration; no blind downgrade was applied. ESLint is pinned to compatible 9.39.4: 10.12.0 crashed in the current Next React plugin. Review dependency updates before release.

## Next

Follow `BUILD_PLAN.md`: agree on the shared contract, verify both agent interfaces, and build the first real two-user session flow. Stripe and billing are deferred until after v1. DeepSeek summarization remains a proposed large-output option; do not treat it as an already working or approved integration.
