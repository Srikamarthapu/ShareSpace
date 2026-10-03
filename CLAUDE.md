# ShareSpace working rules

Read `PRD.md` for the current product requirements, `docs/WORK_SPLIT.md` for ownership, `docs/BUILD_PLAN.md` for implementation order, and `AGENTS.md` for repository checks and data boundaries.

## Branches and main

- Implement every new feature on its own separate branch. Do not build new features directly on `main` or combine unrelated features in one branch.
- Use task-sized commits and pull requests. Coordinate changes to shared contracts before changing both consumers.
- **Do not push to `main` automatically.** Do not merge a pull request into `main` automatically either.
- Push or merge to `main` only when the human explicitly requests it for the current change. A request to build, fix, test, or finish a feature is not permission to update `main`.
- An explicit request to update `main` applies only to that change; it does not authorize future automatic updates. Never force-push or rewrite shared history without a separate explicit request.

## Scope and verification

- Follow the resolved v1 PRD. Stripe and all billing work are deferred until after v1. DeepSeek summarization is a proposed optional extension, not a verified integration.
- Respect teammate ownership and keep shared Zod/API contract changes small and reviewed.
- Keep sample data separate from live accounts. Keep secrets, raw hooks, private sessions, and source content out of logs and Git.
- Run `npm run check` for code changes, `npm run test:e2e` for workflow changes, and database tests for migration changes. Use proportionate document checks for documentation-only edits.
- Report exactly what was verified. Fixture tests do not prove live providers, real agent capture, deployment, or multi-user behavior. Missing evidence is unknown.
