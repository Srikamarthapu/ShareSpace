# Teammate 1 progress — October 3, 2026

The dark ShareSpace design is approved and remains the web product baseline. This is a progress record, not a claim that the v1 release or live two-builder workflow is complete. See the [PRD](../PRD.md), [ownership split](WORK_SPLIT.md), [build plan](BUILD_PLAN.md), and [backend handoff](WEB_BACKEND_HANDOFF.md).

## Current status

| Area | Status | Evidence and limit |
| --- | --- | --- |
| Dark web design | Approved | Existing product surfaces remain the visual baseline. |
| Sample workspace, session list/detail, coordination, connection guidance, and settings | Implemented as sample experiences | Sample state remains isolated from authenticated account data. It does not prove provider or multi-user behavior. |
| Team/setup, invitation, device, privacy/sharing, session/history, warning, and storage UI flows | In progress in Teammate 1 work | Flows are being built against labeled fixtures while the backend contract is pending. Full responsive, accessibility, and workflow QA remains pending. |
| Supabase web authentication | Implemented locally; live provider flow unverified | GitHub OAuth PKCE and callback handling land in the authenticated workspace. The inspected Supabase Auth settings reported GitHub disabled; provider credentials and allowed redirects must be configured before an end-to-end login can pass. |
| Real project reads | Implemented as a narrow foundation | `/live` and `GET /api/projects` read member-visible project names through the authenticated Supabase client. No team or repository mutations are available. |
| Supabase backend | Blocked on teammate 2 | The connected project `cdrkkszcrfznhsgvfdfi` had no public tables, functions, or migrations on October 3, 2026. `supabase/schema.sql` is a draft, not an applied migration. |
| Vercel preview | Unverified | Deployment setup is being investigated. No preview URL or deployed end-to-end evidence is recorded here. |
| CI workflow | Added in this change; execution pending | `.github/workflows/check.yml` runs `npm run check` and desktop/mobile Chromium E2E on pull requests and branch pushes. A green run is required before reporting CI passed. |

## Release checklist

- [x] Approved dark UI retained; sample and real-account data stay separate.
- [x] Local web authentication and read-only project listing are available.
- [ ] Finish fixture-backed Teammate 1 setup, invite, device, sharing/privacy, session, warning, and storage screens.
- [ ] Settle the shared browser/backend contract with Teammate 2 and apply reviewed migrations/functions to the connected Supabase project.
- [ ] Configure GitHub OAuth and allowed callback URLs; complete a real sign-in and sign-out walkthrough.
- [ ] Wire real reads, Realtime recovery, and privileged mutations only to the settled contract.
- [ ] Complete desktop/mobile, keyboard, accessibility, loading/error/empty, and end-to-end QA.
- [ ] Verify a Vercel preview against the configured Supabase backend.
- [ ] Pass CI and complete the two-account acceptance walkthrough in the PRD.

Fixture checks, local auth scaffolding, and a CI definition do not satisfy the real-provider, authorization, retention, or multi-user release gates.
