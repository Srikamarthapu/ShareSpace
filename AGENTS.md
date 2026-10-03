# ShareSpace

This repository is a starter foundation, not the completed PRD release.

- `apps/web`: Next.js workspace. Sample data is visibly labeled and persisted only in this browser. Real auth lives at `/login` and `/live`; never mix the two data sources.
- `apps/adapter`: opt-in local adapter foundations. Never upload raw hooks, environment variables, private sessions, or secrets.
- `packages/core`: shared Zod contracts and deterministic policy. Change these through a small reviewed PR before changing both consumers.
- `supabase`: migration history and database access tests. Keep RLS enabled and enforce membership at every sensitive boundary.
- `docs/BUILD_PLAN.md`: proposed two-person ownership and implementation gates.

Use Node 22.12+ and npm workspaces. Run `npm run check` for code changes and `npm run test:e2e` for workflow changes. Run database tests when changing migrations. Pin dependency versions and commit the lockfile. Do not claim live provider, agent, deployment, or multi-user verification from fixture tests. Missing evidence or providers return unknown, never clear. Keep source content out of logs. Never infer authorization from a submitted user/project ID.

Make task-sized branches and PRs. Avoid opportunistic edits in the other builder's area. Use concise progress notes and proportionate verification.
