# ShareSpace local adapter

The live adapter shares newly observed, bounded agent events after pairing and explicit local consent. It supports current Claude Code command hooks and an explicit read-only `codex exec --json` run. It never scans existing agent sessions, reads transcript files, reads shell history, or uploads raw hooks, tool arguments, commands, or environment values. The legacy `preview` and `hook` commands remain local-only.

## Pair a repository

Install dependencies in the ShareSpace checkout. Use an absolute `--root` for the repository you want to share; npm workspace commands change their working directory, so the explicit root avoids ambiguity.

```sh
npm run adapter -- doctor
npm run adapter -- pair --root /absolute/project --server https://YOUR_PROJECT.supabase.co --key YOUR_PUBLIC_PUBLISHABLE_KEY --repo owner/repository --agent claude_code --consent
```

`--consent` authorizes bounded, redacted current prompts, assistant replies, and tool metadata. The optional `--share-tool-excerpts` flag additionally allows text returned directly by a supported file tool for a validated repository file. Shell and MCP output remain metadata-only because their output can include environment values or files outside the repository.

Approve the displayed code in the signed-in ShareSpace workspace, then enable sharing in Settings. Pairing writes the device token only to a private `device.json` under `~/.local/share/sharespace/`, with mode 600 and a private directory. Do not copy this file into Git or share it with a teammate. Each person pairs their own device. The repository UUID and device UUID from approval are checked against the server before capture and before each delivery attempt.

```sh
npm run adapter -- live-status --config /absolute/private/device.json --root /absolute/project
```

This verifies current access, sharing and storage state. `doctor` probes installed CLI versions and static readiness only; it does not contact providers, read credentials, or prove end-to-end operation.

## Claude Code

```sh
npm run --silent adapter -- hook-template --config /absolute/private/device.json --root /absolute/project
```

The printed JSON is a template. Merge its `hooks` into the paired repository's `.claude/settings.local.json`, preserving existing settings and hooks. The command does not install or overwrite settings. It uses an absolute Node executable, the installed TSX loader and adapter entry point, so npm progress text cannot pollute Claude's JSON hook output. Moving the ShareSpace checkout requires regenerating the template.

Start a fresh Claude session in the paired repository. The hooks cover `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`, and `SessionEnd`. `Stop` uses the current `last_assistant_message`; it does not open `transcript_path`. Prompt capture may include scheduled work and subagent reports because Claude also emits UserPromptSubmit for those. Only an advisory UserPromptSubmit response is written to hook stdout; capture failures continue the agent without blocking.

Current source fields follow the [Claude Code hooks reference](https://code.claude.com/docs/en/hooks). `prompt_id` requires Claude Code 2.1.196 or later. Hook IDs derived from `prompt_id` or `tool_use_id` deduplicate repeated current events. Older events lacking those fields use random IDs, so cross-invocation deduplication is not claimed. Network retries always reuse the exact same event batch and IDs. Local session metadata stores only IDs, sequence counters and a started flag, never transcript text.

## Codex

Pair a separate device with `--agent codex`, then run a fresh, explicit session:

```sh
npm run adapter -- codex --config /absolute/private/codex-device.json --root /absolute/project --prompt "Inspect this repository and explain where a shared counter would belong. Do not change files."
```

The wrapper invokes `codex exec --json --sandbox read-only --ephemeral`. It does not resume private or historical sessions. Normal assistant responses remain visible locally. Uploaded assistant messages are bounded and redacted; command events contain status and tool metadata only. Reasoning, arbitrary MCP objects, raw commands and command output are excluded. JSON lines exceeding 512 KiB are discarded with bounded memory. See the official [Codex non-interactive reference](https://developers.openai.com/codex/noninteractive/).

## Privacy and delivery limits

- Prompt/reply/file excerpts are at most 280 characters plus a truncation marker. Pattern redaction covers known credentials and absolute paths; it cannot detect every possible secret. Do not share sensitive prompts.
- File paths must resolve inside the paired root. Traversal, outside-root paths, symlink escapes, secrets, agent/session directories and generated artifacts are rejected before an excerpt is generated.
- Off, pause, unknown capacity, wrong scope or revoked access stop uploads. Ingest also enforces server-side membership, device scope and private-session state.
- There is no offline transcript queue. A batch has one immediate retry after rechecking consent. Failed captures are dropped, never replayed when sharing is later re-enabled. A gap in session sequence numbers may therefore represent dropped capture.
- Hook timeout is 60 seconds and the observer fails open. The per-session lock serializes current events; old locks are reclaimed only when their owning process no longer exists. Overlap checks are advisory and may return unknown.
- The adapter provides partial capture, not complete native integration. Existing unit fixtures prove the conversion and privacy rules; actual installed-agent and two-user verification must be run separately.

Local fixture tools are still available through `preview` and `hook`. Their separate legacy consent configuration is documented in `examples/adapter.config.example.json`; that file is not the live paired device configuration.
