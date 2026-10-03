# Web preview and integration checklist

## Local development

Use the pinned Node 22.22.3 and npm 10.9.8, then run `npm ci` and `npm run dev` at the repository root. The sample workspace works without environment variables. The active local review server uses `http://127.0.0.1:3100` with Webpack.

For new local service setup, copy the root `.env.example` to `.env`. Next's app environment files and existing shell/deployment values take precedence; existing `apps/web/.env.local` setups continue to work. The root file supplies only missing values and remains ignored by Git and Vercel uploads.

Sample settings, devices, invitations, and history are browser-local fixtures. They never authorize a real account or invoke a backend mutation. The authenticated `/login` and `/live` paths use the separate Supabase client.

## Supabase authentication

The existing ShareSpace project is `cdrkkszcrfznhsgvfdfi`. Its public URL and publishable key are configured locally in ignored `apps/web/.env.local` and in Vercel's **preview** environment. No service-role or provider key is needed by the browser.

The October 3 inspection found Auth reachable, email/password enabled, and GitHub disabled. To finish the real sign-in walkthrough:

1. Configure a GitHub OAuth application and enable GitHub in the ShareSpace Supabase Auth settings. The GitHub application's authorization callback is the callback URL displayed by Supabase, not the Next.js callback.
2. Add the exact app callbacks to Supabase's redirect allowlist: `http://localhost:3000/auth/callback`, `http://127.0.0.1:3100/auth/callback`, and the chosen Vercel preview URL with `/auth/callback` appended. Restrict production redirects to the production domain when it exists.
3. Visit `/login`, complete GitHub authorization, verify arrival at `/live`, then sign out. The callback always returns to `/live`; caller-provided return destinations are ignored.
4. Repeat with a second independent account after teammate 2 deploys the reviewed membership backend. Authentication alone does not prove membership, RLS, or cross-user behavior.

An unknown provider status permits a retry; a confirmed disabled provider is shown as unavailable. Callback errors never display provider-supplied descriptions or authorization codes.

## Vercel

- Project: `sharespace` (`prj_EpVL3X4oJiAdZE380XvzAeunEzPP`).
- Scope: `swis-projects-066d8b1d` (`team_hex9yJ9eRmm2MssNWmHqTAQ6`).
- Root directory: `apps/web`; Next.js framework; project Node setting: `22.x`.
- `apps/web/vercel.json` installs and builds from the monorepo root. Keep the workspace packages available outside the app root.
- `.vercelignore` excludes credentials, macOS resource forks, generated output, local state, and test artifacts. A dry-run upload manifest must contain none of those files.
- Only preview environment variables have been configured. The active protected preview is [sharespace-qh2lugwie](https://sharespace-qh2lugwie-swis-projects-066d8b1d.vercel.app), deployment `dpl_4hAUCH5BTEKkw7mkQCKnXKYworwu`, source `a119f37`.
- The first deployment was classified as production despite the explicit preview target. A subsequent deployment correctly reported Preview (`target: null`, `productionUrl: null`); the unintended first deployment `dpl_J4NQbYxbnr5ovtudCpsFa2WNoyba` was removed. There is no production release from this work. Verify the returned environment on every deployment, especially for a new project.

From the linked repository root, the verified CLI version and explicit preview target are:

```sh
npm exec --yes --package=vercel@62.2.0 -- vercel deploy --dry --target preview --scope swis-projects-066d8b1d
npm exec --yes --package=vercel@62.2.0 -- vercel deploy --target preview --scope swis-projects-066d8b1d
```

Keep Vercel deployment protection enabled. Inspect deployment build logs and test the actual preview after deployment; a local build is not hosted verification. Record the verified URL and results in `T1_PROGRESS.md`.

Hosted smoke verification used authenticated `vercel curl` requests with protection still enabled: `/` and `/login` returned 200 with expected content, and signed-out `/live` emitted the framework redirect to `/login`. GitHub OAuth was correctly shown as disabled. These checks do not replace an interactive hosted login or the two-account walkthrough.

## Integration gate

`WEB_BACKEND_HANDOFF.md` lists the integration requirements and points to the merged draft contract. The v1 migration replaces the legacy draft SQL; review its rollout and the matching functions before cloud deployment, then connect authenticated reads, authorized Realtime recovery, and server mutations. Finally run the PRD's real two-account, two-agent walkthrough.

The GitHub workflow runs lint, workspace types, unit tests, a production build, and desktop/mobile Chromium workflows against that build. Local `npm run test:e2e` still starts the development server unless an existing server is supplied; `CI=1` selects production and requires `npm run build` first. It does not deploy or merge `main`. Stripe remains outside the v1 release path.
