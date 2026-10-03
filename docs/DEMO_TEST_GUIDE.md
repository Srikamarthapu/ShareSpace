# Try the real ShareSpace demo

App: https://sharespace-beta.vercel.app

The workspace starts empty. Sessions appear only after each builder opts in and pairs an adapter. Stripe uses Project sandbox; no real money is charged. End-to-end testing is left to the builders at their request.

## 1. Create two accounts

1. Open the app, expand **Create an account with email**, and choose **Create account** after entering your name, email, and password.
2. Follow the Supabase confirmation email, then sign in.
3. Use a second browser profile or private window for your teammate's account.

Email confirmation is enabled with Supabase's built-in sender. That sender only delivers to email addresses belonging to members of the Supabase organization and is rate limited. For this demo, use those member addresses. If confirmation does not arrive, check spam and organization membership; changing the displayed sender name cannot bypass this restriction. Arbitrary public signup needs custom SMTP later.

## 2. Create and join a workspace

1. Builder 1 enters a team name and the exact GitHub `owner/repository` name.
2. In **Settings → Team**, create a new invite link and share it privately with Builder 2.
3. Builder 2 opens the link while signed in and chooses **Join team**.
4. Each builder opens **Settings → Sharing** and turns on **Share future agent sessions with my team** for the repository. Leave **Pause new event uploads** off.

The free workspace allows two members and one repository. The app does not clone GitHub repositories or grant GitHub access; each builder needs their own local checkout and repository permissions.

## 3. Pair a local adapter

In the ShareSpace source checkout, install dependencies with `npm ci`. Use Node 22.12+ and the public Supabase URL/key from your ignored root `.env`. Never use the Supabase secret or an agent subscription token in the adapter.

```sh
npm run adapter -- pair \
  --root /absolute/path/to/your/project \
  --server https://cdrkkszcrfznhsgvfdfi.supabase.co \
  --key YOUR_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --repo owner/repository \
  --agent claude_code \
  --consent
```

Open the approval URL/code displayed by the command, review the repository and device, and approve it while signed in. The command saves a private device configuration and prints its path. Each builder pairs their own device. Use `--agent codex` for a separate Codex device.

```sh
npm run adapter -- live-status --config /absolute/private/device.json --root /absolute/project
```

The repository name must match the workspace. The configuration stores a scoped device token privately; do not commit or share it.

## 4. Generate new agent activity

For Claude Code:

```sh
npm run --silent adapter -- hook-template --config /absolute/private/device.json --root /absolute/project
```

Merge the printed `hooks` into that project's `.claude/settings.local.json`, preserving existing settings. Start a fresh Claude Code session there and ask it to inspect a harmless file. The template does not install itself. It reads current hook events, not historical transcripts.

For Codex:

```sh
npm run adapter -- codex --config /absolute/private/codex-device.json --root /absolute/project --prompt "Inspect this project and explain where a shared counter would belong. Do not change files."
```

This launches a fresh read-only `codex exec` session. Existing Codex app conversations are not automatically captured. Both agents require their own working local CLI authentication.

Open **Sessions** in each browser and select the new session. New visible events refresh periodically. Prompts and replies are bounded/redacted, not full historical transcripts; shell/MCP output is metadata-only. See [adapter details](../apps/adapter/README.md).

## 5. Try coordination and privacy

For a Jev warning demonstration:

1. Both people must be members of the same team, have sharing enabled and unpaused, and pair their own agent to the same repository. Each local root must be that repository's actual checkout. Teammates can view sessions without cloning the repository, but capturing their own work requires a local checkout.
2. Builder 1 submits this through their paired adapter: **"Implement a case-insensitive creator-name search filter on CreatorSignal's results page. First inspect the current implementation and propose a plan; do not edit files, run tests, or read secrets."** Wait until its session appears in ShareSpace.
3. Builder 2 submits: **"Implement a creator-name search box for CreatorSignal's results page with case-insensitive filtering. Inspect the existing implementation and propose a plan; do not edit files, run tests, or read secrets."** Use their own Codex adapter command or a fresh Claude Code session with the configured prompt hook.
4. Open **Warnings** after Builder 2's prompt. A successful overlap classification displays **Possible overlap**, the prompt excerpt, and a **Related session** link to Builder 1's evidence. No overlap or unavailable outcomes are shown explicitly. A warning is advisory and does not block either agent.

The backend asks Jev whether the new prompt requests software implementation or repair, then whether it duplicates or conflicts with teammate work. It considers up to eight other-member sessions in the same repository with activity in the last 24 hours; ended sessions still qualify if their history is shared and retained. A read-only README summary is not an implementation request and can be skipped without storing a warning check. Sharing technology, files, or wording alone does not guarantee overlap. Existing Codex desktop conversations are not captured automatically.

On the current free team, CreatorSignal occupies the single repository slot. To demonstrate ShareSpace code instead, register that repository and pair both local adapters to it; the existing CreatorSignal device does not switch repositories automatically.

Other privacy checks:

- Pause uploads in Settings and generate new activity. Resume afterward; dropped activity is not backfilled.
- Mark an owned session private. It should disappear from the teammate's view. Change it back to shared to restore visibility.
- Delete a session's history and confirm its transcript is removed.
- Revoke a device in **Devices**. Further uploads from its old token should fail; pair again to reconnect.
- **Storage** shows measured usage. History cleanup begins near 40 MB per person and aims for 30 MB, with a 50 MB person budget. A separate database guard warns at 350 MB and pauses new uploads at 400 MB. Other project data still needs normal monitoring.

## 6. Try the $20/month Stripe subscription

1. As the workspace admin, open **Billing** and choose **Start $20/month test subscription**.
2. In Stripe Checkout use card `4242 4242 4242 4242`, any future expiry, any three-digit CVC, and a test name/address. Never enter a real card.
3. Complete Checkout and return to ShareSpace. The plan becomes **ShareSpace Pro** after the signed webhook verifies the subscription; a return URL alone does not grant access.
4. Pro allows up to 10 members and 5 repositories. Add another repository in Team to try the upgraded limit.
5. Choose **Manage test subscription** for Stripe's portal. Cancellation is scheduled for the period end; Pro remains until its paid period expires. Existing work is retained after a downgrade.

## Configuration and current boundaries

- Jev: `https://api.typesafe.ai`, model alias `jev-latest` (resolved to `jev-1.13.0` during the connection check).
- DeepSeek: `https://api.deepseek.com`, model `deepseek-flash`. The optional compaction helper is implemented and the provider call succeeded. It is not automatically attached to capture; it requires a future explicit summarization-consent flow.
- Keys live in ignored `.env` locally, sensitive Vercel billing variables, and Supabase Edge Function secrets. None belongs in `NEXT_PUBLIC_*` except the Supabase publishable key and URL.
- Backend: `teams`, `devices`, `sharing`, `ingest`, `overlap-check` on Supabase. Web/billing on Vercel.
- One real paired Codex run captured six persisted events, and its transcript was opened in the hosted app. No full hosted Checkout, email-delivery, Claude capture, or two-user overlap pass is claimed. Report an error with its screen/action and message, without credentials or private transcript text.
