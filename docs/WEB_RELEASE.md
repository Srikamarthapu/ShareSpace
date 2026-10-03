# Web preview and integration checklist

## Local development

Use the pinned Node 22.22.3 and npm 10.9.8, then run `npm ci` and `npm run dev` at the repository root. The sample workspace works without environment variables. The active local review server uses `http://127.0.0.1:3100` with Webpack.

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
- Only preview environment variables have been configured. No production deployment or production environment is claimed.

From the linked repository root, the verified CLI version and explicit preview target are:

```sh
npm exec --yes --package=vercel@62.2.0 -- vercel deploy --dry --target preview --scope swis-projects-066d8b1d
npm exec --yes --package=vercel@62.2.0 -- vercel deploy --target preview --scope swis-projects-066d8b1d
```

Keep Vercel deployment protection enabled. Inspect deployment build logs and test the actual preview after deployment; a local build is not hosted verification. Record the verified URL and results in `T1_PROGRESS.md`.

## Integration gate

`WEB_BACKEND_HANDOFF.md` lists the missing teammate 2 contracts. Do not deploy the legacy draft SQL merely to make a screen look connected. Review the v1 schema and functions first, then connect authenticated reads, authorized Realtime recovery, and server mutations. Finally run the PRD's real two-account, two-agent walkthrough.

The GitHub workflow runs lint, workspace types, unit tests, a production build, and desktop/mobile Chromium workflows. It does not deploy or merge `main`. Stripe remains outside the v1 release path.
