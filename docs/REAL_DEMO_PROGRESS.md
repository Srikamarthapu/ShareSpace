# Real demo implementation — October 3, 2026

Branch `feat/real-demo`, starting from hosted `e9aaf78` plus combined branch merged at `ebeac52`. Main unchanged.

## Completed configuration
- Supabase ShareSpace `cdrkkszcrfznhsgvfdfi` healthy; initial remote inspection found no application tables/functions/migrations.
- Auth site URL changed to https://sharespace-beta.vercel.app and exact hosted/local callback allowlist added. Email confirmations retained.
- Root ignored `.env` contains the user's Jev, DeepSeek, and Stripe test keys. Real benign provider requests succeeded: Jev `jev-latest` resolved `jev-1.13.0`; DeepSeek `deepseek-flash` succeeded. Supabase variables restored privately. No keys printed.
- Stripe Project sandbox `acct_1UMWLv4sNm0MtdiS` selected by user. Created Pro demo product `prod_VNLmqm6CtiNmeq` and USD2000/month price `price_1UMb4U4sNm0MtdiSSVMPDqiF`, livemode=false.

## Implementation complete
- Real auth/workspace flows replace runtime mock screens. Pure fixtures remain only in test folders.
- Cloud migrations applied with matching local versions; all five Edge Functions deployed, including Jev overlap checks, consent/membership-scoped ingestion, and storage cleanup.
- Stripe test webhook and customer portal created; sensitive billing variables configured in Vercel. Portal cancellation is at period end.
- Claude hooks and a fresh read-only Codex wrapper implemented. Optional DeepSeek compactor works with explicit consent and redacted bounded input; automatic capture compaction is not wired.
- Legacy project/agent Vercel routes return 410. Health reports web-process health only. Storage definer RPC reviewed as caller-only; private tables intentionally have no client RLS policies.

## User-directed handoff
- The user asked to stop further tests and try the demo themselves. No further tests are running. Full combined checks and hosted end-to-end verification were not completed.
- Before that request: production build, 22 anonymous auth/theme browser checks, 28 web unit checks, 59 backend/24 RLS/21 billing database assertions, 25 core checks, 8 Edge checks, 20 adapter checks, and 10 DeepSeek helper checks passed in their stated scopes.
- The two-user browser check reached the welcome screen but failed on an onboarding wait race before creating a team. The helper was corrected without rerunning. No successful two-user, installed-agent, hosted Checkout/webhook, or confirmation-email delivery pass is claimed.
- Email confirmations stay on with Supabase's built-in sender, per user choice. Use Supabase organization-member email addresses for this demo; no custom SMTP was configured.
- Vercel production deployment completed: `sharespace-pvecl0zm7-swis-projects-066d8b1d.vercel.app`, aliased to https://sharespace-beta.vercel.app. Follow [the manual demo guide](DEMO_TEST_GUIDE.md). Main remains unchanged.

## Onboarding follow-up
- User reported a 400 on team creation. The UI incorrectly suggested a member limit for every invalid request. The core contract accepts `owner/repository`; the form's broken HTML pattern allowed invalid shapes to reach that boundary.
- Removed that pattern, added shared-contract client validation with field-linked errors, and accepted GitHub HTTPS/SSH URLs by converting them to the canonical repository name. Applied the same input handling to adding repositories. Server authorization/validation stays unchanged.
- No tests run by root at the user's request. Vercel deployment build is the required publishing step; the user will retry the real form.
- Fix deployed successfully to production as `sharespace-nbn7y1yqh-swis-projects-066d8b1d.vercel.app`; the public alias remains https://sharespace-beta.vercel.app.
