# Combined branch verification — October 3, 2026

Target branch: `integration/combined-work`. `main` and the original feature/teammate branches are preserved.

## Included work

- Teammate 1 checkpoint `899f688` (`feat/t1-integration`), including the dashboard and authentication ancestors.
- `feat/workspace-controls` at `77989dd` and `feat/session-history` at `1fae132`. Their changes were already cherry-picked into the checkpoint; `git cherry` confirmed matching patches. Ancestry-only merges consolidate their histories without replacing later integration fixes.
- `mann/teammate2` through `72fddca`, including the v1 contract and the subsequent schema/RLS migration. The newer commit arrived during verification and was included before the final pass.

## Checks

Runtime: Node 22.22.3 and npm 10.9.8.

| Stage | Check | Result |
| --- | --- | --- |
| Consolidated teammate 1, `fcb6b5d` | `npm run check` | Passed: lint, workspace types, 47 unit tests, production build |
| Consolidated teammate 1, `fcb6b5d` | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run test:e2e -- --workers=2` | 70 passed, two intentional desktop skips for mobile-only cases |
| Combined source, `18a6e9a` | `npm run check` | Passed: lint, workspace types, 75 unit tests, production build |
| Combined production build | `env -u PLAYWRIGHT_BASE_URL CI=1 npm run test:e2e -- --workers=2` | 70 passed, two intentional desktop skips; 45.7 seconds |
| Merged v1 migration | Exact updated `supabase/tests/database/v1_access.test.sql` | Migration applied; all 24 pgTAP access assertions passed in an isolated Supabase PostgreSQL 17.6.1.134 container |

The final documentation also clarifies cursor semantics in source comments; those comments do not alter the checked SQL or application behavior.

## Merge resolutions

- Kept the approved UI, GitHub OAuth/callback behavior, and sample/live-account boundary while adopting the shared root `.env.example`.
- Replaced the cached Next environment-loader call with Node's native loader. Four regression cases cover no root file, root loading, app-file precedence, and deployment-value precedence.
- A full-run subprocess startup timeout in the initial regression test was fixed by using native TypeScript stripping instead of an extra loader; all 75 unit tests subsequently passed.
- An accessibility scan was interrupted by a development-page reload. CI and the final browser run use the already-built production app, so development reloads cannot interrupt assertions.
- The reconnect workflow test now accepts both intended reading states: automatic following at the bottom, or an explicit jump when reading earlier events. It still requires both recovered events, deduplication, and persistence after reload.
- Database tests set matching individual and JSON JWT claims, and clear both for anon. This supports the image's `auth.uid()` helper as well as newer helpers without changing the caller, RLS policies, or any of the 24 assertions.

## Database verification scope

The disposable container had no published port or volume and no network access. The test used synthetic users and rolled back; follow-up counts confirmed no test teams/users remained. The container was removed and existing local databases were preserved. Logs and reproduction notes are saved locally under ignored `tmp/db-verification/`.

Both available Supabase CLI launchers were killed with exit 137, so `supabase test db` and advisors could not run through the CLI on this host. The SQL migration and pgTAP assertions ran directly in the isolated PostgreSQL image. This does not verify Auth HTTP, PostgREST, Realtime delivery, cloud deployment, or the complete multi-user application.

Concurrent theme and transcript work began after the verified build and continues on separate branches. It is excluded from this merge and its verification claims. Final merge fixes were committed from an isolated checkout to preserve that work.

## Remaining integration boundaries

- The migration and draft contract are available locally; this task does not apply cloud migrations or implement Edge Functions/adapters.
- The old `projects` read foundation must be replaced with authorized v1 team/repository reads when the backend is connected. Sample flows remain visibly separate.
- Identity-generated `ingest_id` reflects allocation order, not commit order. Exclusive greater-than cursor reads alone can miss late commits. Settle and test safe reconnect reconciliation before wiring the live feed; see [CONTRACT.md](CONTRACT.md).
- The earlier Vercel preview contains teammate 1 source `a119f37`, not this combined branch. No production deployment or merge to `main` is performed here.
