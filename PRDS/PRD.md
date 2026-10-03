# PRD — teamagents

A shared window into your team's coding agents. Everyone on a team can see each other's agent sessions live — prompts, assistant messages, tool calls — and every new prompt is checked against what teammates are already building, so two agents never quietly build the same feature.

Status: draft v1 · Built for: Supabase Select YC 2026 hackathon · Date: 2026-10-03

---

## 1. Problem

Teams now do most of their coding through agents (Claude Code, Cursor, Codex). Each agent session is a private silo:

- You can't see what your teammates' agents are doing right now.
- Two people ask their agents for the same feature and only find out at merge time.
- Useful context (how a teammate got their agent to solve X) is locked in their local transcript files.

## 2. Goals

1. **Teams** — join a team with an invite link.
2. **Live transcripts** — see teammates' raw sessions (prompts, messages, tool calls + outputs) live, for every repo the team shares.
3. **Conflict check** — when you prompt your agent to build something, it is told if (a) a teammate's agent is working on the same thing right now (including uncommitted changes) and (b) it should first check whether the feature already exists in the code.
4. **Privacy you control** — per-user default visibility, per-repo overrides, secret redaction, and a personal-content check before anything is shared.

## 3. Non-goals (v1)

- Credit / usage sharing between teammates (dropped: too much work and ToS risk).
- Comments or reactions on transcripts.
- Search across transcripts.
- Org UI (schema keeps an `org_id` column for later).
- Blocking mode for the conflict check (v1 only warns).
- Agents other than Claude Code, Cursor, Codex CLI.

## 4. Users and core flows

### 4.1 Onboarding
1. User signs in on the web app with GitHub (Supabase Auth).
2. User creates a team or opens an invite link to join one.
3. User runs `npx teamagents login` → browser opens → CLI receives a session token and stores it in `~/.teamagents/config.json`.
4. User runs `npx teamagents init` → installs **user-level** hooks into:
   - `~/.claude/settings.json`
   - `~/.cursor/hooks.json`
   - `~/.codex/hooks.json`

### 4.2 First session in a new repo
1. Hook fires in a repo with git remote `github.com/acme/api`.
2. CLI sees the remote is not linked yet → asks once: `Link github.com/acme/api to which team? (Acme / none)`.
3. Choice is saved server-side (`user_repo_links`). Repos linked to `none` are ignored forever (until changed).
4. Any teammate who links the same normalized remote URL to the same team shares that repo automatically.

### 4.3 Normal session (sharing)
1. User prompts their agent.
2. Hook runs `teamagents hook <event>` locally (see §6).
3. CLI resolves visibility (repo override → user default). **Private sessions never leave the laptop** — the CLI exits immediately.
4. CLI redacts secrets, runs the Jev privacy check, runs the conflict check, then uploads the event.
5. Teammates see the event appear live on the dashboard.

### 4.4 Personal content flagged
1. Jev flags a prompt as personal.
2. CLI pauses upload for that session and queues events locally.
3. User sees (via the agent's system message / terminal):
   `teamagents: this looks personal — session paused. Run "teamagents share <id>" to share anyway, or "teamagents private <id>" to keep it private.`
4. `share` flushes the queue; `private` drops it and marks the session private locally.

### 4.5 Conflict found
1. User prompts: "add Google OAuth login".
2. Conflict check finds Priya's live session in the same repo editing `auth/` with a prompt about OAuth.
3. The agent receives extra context:
   `Heads up: Priya (live, 3 min ago) is working on "OAuth login with Google" in this repo — uncommitted changes in auth/oauth.ts, auth/callback.ts. Session: <dashboard link>. Tell the user before continuing.`
4. A row is written to the Conflicts feed.

## 5. Features

### 5.1 Teams
- Flat teams. A user can be in many teams.
- Roles: `admin`, `member`. Admin can rotate the invite link, remove members, and set the team's Jev API key.
- Invite = URL with a random code. Anyone signed in with the link joins as `member`.

### 5.2 Visibility
- Two levels: **Private** (never uploaded) and **Team** (visible to all team members).
- User default: `Team` or `Private` (set in web settings, cached by CLI).
- Per-repo override: same two values, keyed by remote URL.
- Resolution order: repo override → user default.
- Changing visibility only affects future events. Already-uploaded sessions can be deleted by their owner.

### 5.3 Secret redaction (always on, runs on the laptop)
Before any upload, replace with `[REDACTED]`:
- Known key formats: `sk-ant-…`, `sk-…`, `ghp_…`/`github_pat_…`, `AKIA…`, `xox[bp]-…`, JWTs, PEM private-key blocks, `Bearer …` headers.
- Literal values from `.env*` files in the repo root (read locally, matched exactly, never uploaded).
- Long high-entropy strings (≥ 32 chars, Shannon entropy threshold — tune on real data).

### 5.4 Personal-content check (Jev)
- Runs on each **user prompt** before it is uploaded.
- Laptop → `privacy-check` Edge Function → Jev → result back. The function **does not store** the text.
- Jev question: `boolean` — "Does this text contain personal, non-work content (health, relationships, finances, personal messages, etc.)?"
- Flag if probability ≥ 0.7 (tune).
- If the check fails or times out → treat as **flagged** (fail closed for privacy).

### 5.5 Live transcripts (dashboard)
- **Team home** — live agents now: who, agent type, repo, branch, latest prompt, status. A session is *live* if `last_event_at` < 5 min ago; *idle* after a `Stop` event; *ended* after `SessionEnd`.
- **Session view** — full transcript, streaming via Realtime. Tool calls are collapsible (input + output). Large outputs load from Storage on expand. Shows the latest uncommitted diff file list.
- **Conflicts feed** — every warning, with links to both sessions and the Jev verdict + probability.
- **Settings** — default visibility, per-repo overrides, linked repos, team admin (invite link, members, Jev key).

### 5.6 Conflict check
Runs on every user prompt in a Team-visible session.

1. CLI sends `{repo_id, session_id, prompt (redacted)}` to the `conflict-check` Edge Function.
2. Function asks Jev `is_feature_request` (`boolean`). If false → return nothing.
3. Function loads candidate sessions: same repo, other users, live or idle within the last 2 h. For each: last 3 prompts + latest diff file list + a diff excerpt (≤ 4 KB).
4. For each candidate, Jev `choice` question: `same_feature` / `related` / `unrelated`.
5. Return:
   - For every `same_feature`, a warning like the one in §4.5 → injected as context to the agent.
   - If `is_feature_request` is true → always add: "Before implementing, search this codebase to check whether this feature already exists."
6. `same_feature` results are written to `conflicts`.

**Time limit: 7 s total.** On timeout or error the prompt continues with no warning (fail open). Hook timeouts in each agent's config are set to 10 s so the CLI's own limit is what fires.

"Is it already in the code" is answered by the user's own agent (via the injected instruction), not by the server. The server never holds a copy of the codebase.

**Cursor:** `beforeSubmitPrompt` cannot inject context. For Cursor the warning is shown as a desktop notification + a line in `teamagents status`, and also injected on the next `postToolUse` via `additional_context`.

## 6. Architecture

```
 Laptop                                              Supabase
┌──────────────────────────────┐                   ┌─────────────────────────────────┐
│ Claude Code / Cursor / Codex │                   │ Edge Functions                  │
│        │ hook                │                   │  • privacy-check  ──► Jev       │
│        ▼                     │   HTTPS (JWT)     │  • conflict-check ──► Jev       │
│ teamagents hook <event>      │ ────────────────► │  • ingest                       │
│  1 resolve repo + visibility │                   │                                 │
│  2 redact secrets            │                   │ Postgres (+RLS)  Storage  Vault │
│  3 privacy-check (prompts)   │                   │        │ Realtime               │
│  4 conflict-check (prompts)  │                   └────────┼────────────────────────┘
│  5 ingest events             │                            ▼
│  6 on Stop: read JSONL       │                   ┌─────────────────────────────────┐
│    backfill + upload git diff│                   │ Next.js dashboard (Vercel)      │
└──────────────────────────────┘                   └─────────────────────────────────┘
```

### 6.1 Why hooks run our CLI (not direct HTTP hooks)
Claude Code supports HTTP hooks that post straight to a URL, but that would send raw text — including secrets and private sessions — off the laptop before redaction. Every hook therefore runs `teamagents hook <event>` locally.

**Rule: the hook must never break the agent.** The CLI always exits 0 (except to inject context), catches all errors, and logs to `~/.teamagents/log`. Failed uploads are queued in `~/.teamagents/queue/` and retried on the next hook.

### 6.2 Hook mapping

| Purpose | Claude Code | Cursor | Codex CLI |
|---|---|---|---|
| Session start | `SessionStart` | `sessionStart` | `SessionStart` |
| User prompt (+ checks) | `UserPromptSubmit` (inject via `additionalContext`) | `beforeSubmitPrompt` (no inject) | `UserPromptSubmit` (inject via `additionalContext`) |
| Tool call / result | `PostToolUse` | `postToolUse` (can inject) | `PostToolUse` |
| Assistant text | from JSONL on `Stop` | `afterAgentResponse` | from JSONL on `Stop` |
| Turn end (diff upload, backfill) | `Stop` | `stop` | `Stop` |
| Session end | `SessionEnd` | `sessionEnd` | `SessionEnd` |

Transcript files (for backfill, path comes from `transcript_path` in hook input):
- Claude Code: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` (written async — may lag hooks).
- Cursor: `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl` (no tool outputs; use hook payloads for those).
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (verify whether newer builds write `.jsonl.zst`).

### 6.3 Uncommitted changes
On every `Stop`, the CLI uploads for the session:
- `git diff HEAD` (redacted, capped at 200 KB; larger → Storage),
- untracked file names (`git ls-files --others --exclude-standard`),
- current branch and HEAD sha.

Only the latest snapshot per session is kept.

### 6.4 CLI auth
`teamagents login` starts a localhost callback server, opens `<web>/cli-login?port=<p>`, the web app (already signed in via GitHub) redirects back with the Supabase session. CLI stores access + refresh tokens and refreshes as needed. All Edge Function calls send the user JWT.

### 6.5 Jev
- Model: TypeSafe AI **Jev** (typed decisions with probabilities, not text generation).
- Access: Vercel AI Gateway, model `typesafe-ai/jev`, `POST https://ai-gateway.vercel.sh/v1/evaluate` with `{model, state, questions}`. Verify the exact request shape against current docs before building.
- Key: **one key per team**, set by a team admin in Settings, stored in **Supabase Vault**. Only Edge Functions read it. It never reaches laptops.

## 7. Data model (Postgres)

```
profiles          id (= auth.users.id) · github_login · avatar_url · default_visibility ('team'|'private')
teams             id · org_id (nullable, unused v1) · name · invite_code · jev_secret_id (Vault) · created_by
team_members      team_id · user_id · role ('admin'|'member') · joined_at          PK(team_id, user_id)
repos             id · team_id · remote_url (normalized) · created_at              UNIQUE(team_id, remote_url)
user_repo_links   user_id · remote_url · team_id (null = "none") · visibility_override (nullable)
sessions          id · team_id · repo_id · user_id · agent ('claude_code'|'cursor'|'codex')
                  · external_id · branch · status ('live'|'idle'|'ended') · title
                  · started_at · last_event_at                                    UNIQUE(agent, external_id)
events            id (bigserial) · session_id · seq · kind ('prompt'|'assistant'|'tool_call'|'tool_result'|'system')
                  · tool_name · content (jsonb, ≤ 10 KB) · storage_path (if larger) · created_at
session_diffs     session_id (PK) · head_sha · files text[] · untracked text[] · diff (or storage_path) · captured_at
conflicts         id · team_id · repo_id · source_session_id · target_session_id · prompt_excerpt
                  · verdict · probability · created_at
```

Remote URL normalization: lowercase host, strip `.git`, convert `git@host:org/repo` → `host/org/repo`.

**RLS:**
- `sessions`, `events`, `session_diffs`, `conflicts`: readable by members of `team_id`. Only Private sessions are never uploaded, so everything stored is team-visible.
- Writes go through Edge Functions (service role) after checking the JWT user owns the session.
- Owner can delete their own sessions (cascades to events, diffs, Storage objects).

**Realtime:** dashboard subscribes to `events` filtered by `session_id` (session view) and to `sessions` filtered by `team_id` (team home).

**Storage:** bucket `tool-outputs`, path `<team_id>/<session_id>/<event_id>`, read policy mirrors `events`.

## 8. Tech stack

| Layer | Choice |
|---|---|
| Database, Auth, Realtime, Functions, Storage, Secrets | Supabase (Postgres, Auth w/ GitHub, Realtime, Edge Functions, Storage, Vault) |
| Web app | Next.js (App Router) + Tailwind + shadcn/ui, hosted on Vercel |
| CLI | TypeScript, published to npm, run via `npx teamagents` |
| Classifier | Jev via Vercel AI Gateway |
| Shared code | One TS monorepo (`apps/web`, `packages/cli`, `supabase/`), shared types generated from the DB schema |

## 9. CLI commands

| Command | Does |
|---|---|
| `teamagents login` / `logout` | Browser login, store/clear tokens |
| `teamagents init` | Install user-level hooks for all detected agents |
| `teamagents link [team\|none]` | Link current repo's remote to a team |
| `teamagents visibility <team\|private> [--repo]` | Set default or current-repo override |
| `teamagents status` | Current repo, team, visibility, queued events, recent conflict warnings |
| `teamagents share <id>` / `private <id>` | Resolve a session paused by the privacy check |
| `teamagents hook <event>` | Internal — called by agent hooks |

## 10. Build order

1. Supabase schema + RLS + GitHub auth; web sign-in, create/join team.
2. CLI `login`, `init` (Claude Code first), `hook` → `ingest` with redaction. Dashboard session view with Realtime.
3. Team home (live agents) + repo linking.
4. `conflict-check` with Jev + context injection (Claude Code). Conflicts feed.
5. `privacy-check` + pause/share flow.
6. Codex hooks, then Cursor hooks.
7. Settings page (visibility, overrides, Jev key, invites).

Demo-critical path: steps 1–4 with Claude Code on two laptops.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Hook bug breaks someone's agent | CLI always exits 0, all errors caught, local queue |
| Secrets leak in transcripts | Mandatory local redaction; owner can delete sessions |
| Jev unavailable / slow | Conflict check fails open (7 s); privacy check fails closed (pause) |
| Cursor can't inject at prompt time | Desktop notification + inject on next `postToolUse` |
| Cursor transcripts lack tool outputs | Use `postToolUse` hook payloads |
| Claude Code JSONL lags hooks | Backfill on `Stop` and again on next `SessionStart` |
| Codex may compress rollouts (`.jsonl.zst`) | Check on a real install; add zstd decode if needed |
| Edge Function time limits | All functions are short request/response; no streaming needed |
| Jev request format differs from notes | Verify against Vercel AI Gateway docs first |

## 12. Open questions

- Should Private sessions still get conflict warnings? That would require sending the (unstored) prompt to the server. v1 default: **no** — Private sessions skip the conflict check.
- Jev flag thresholds (privacy 0.7, conflict choice) need tuning on real prompts.
- Retention: keep transcripts forever, or auto-delete after N days?
