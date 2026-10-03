# ShareSpace local adapter starter

This package is an opt-in, local-only adapter foundation for Claude Code. It has no event upload, device pairing, durable spool, preflight, or continuation delivery yet. `hook` validates and sanitizes an event in memory, then discards it. `preview` is the only command that prints a normalized event, and it does so locally after explicit consent is configured.

The adapter reads command-hook JSON from stdin. It supports `UserPromptSubmit` and `PostToolUse` only. It does not read Claude transcripts, environment variables, or shell history. `UserPromptSubmit` can also run for scheduled work and reports from background subagents, so review that scope before enabling it.

## Try the local CLI

From the repository root:

```sh
npm run adapter -- help
npm run adapter -- doctor
cat apps/adapter/examples/claude-user-prompt-submit.json | npm run adapter -- preview
```

The final command parses a bounded synthetic hook event and reports that sharing is disabled. It will not print the prompt.

To inspect a normalized event, make a private copy of `examples/adapter.config.example.json`, set `repository_root` to a real repository directory, and record the consent timestamp and categories you approved. Keep that file out of Git. Then run:

```sh
cat apps/adapter/examples/claude-user-prompt-submit.json | npm run adapter -- preview --config /absolute/path/to/adapter.json
```

The fixture root is synthetic, so use a fixture with a `cwd` inside the configured repository before enabling consent. Tool paths must resolve under that root. Absolute paths are converted to relative paths; traversal, outside-root paths, and symlink escapes reject the event. Known secret and generated paths are omitted. Only a small allowlist of built-in tool names is kept; other names become `Other`.

The default categories are all disabled. `user_prompts` allows a redacted excerpt of up to 280 characters. `tool_metadata` allows the normalized tool name, status, safe relative paths, and timing metadata. `tool_excerpts` is a separate opt-in within tool metadata; it allows a redacted excerpt of up to 280 characters. Tool arguments and Bash commands are never copied into the event. Pattern redaction helps with known token forms and absolute paths, but cannot guarantee detection of every secret.

`doctor` checks only the local Node runtime and static adapter readiness. It never reads configuration or credentials and never prints environment values.

## Claude Code hook template

Run `npm run adapter -- hook-template` to print the same settings fragment in `examples/opt-in-claude-hooks.json`. Review it before manually adding it to `.claude/settings.local.json`. The template is not installed automatically. It invokes the local workspace CLI with a 5-second timeout. The handler emits no stdout because stdout from `UserPromptSubmit` can be added to Claude's context.

The hook locations and stdin contract follow the current [Claude Code hooks reference](https://code.claude.com/docs/en/hooks): command hooks receive JSON on stdin; `UserPromptSubmit` includes `prompt`; and `PostToolUse` includes `tool_name`, `tool_input`, `tool_response`, and `tool_use_id`. This repo has not verified the exact behavior against an installed Claude Code version. The template is an example, not a claim of live capture or production compatibility.

## Event IDs and boundaries

Session IDs are transformed into deterministic UUIDs. Event IDs are deterministic when Claude supplies `prompt_id` or `tool_use_id`, which makes a retried hook input produce the same ID. When those stable source IDs are absent, an event ID is random so repeated identical prompts remain distinct. Claude's documented hook input has no event timestamp or monotonic source sequence, so `occurred_at` is the local normalization time and the adapter uses `source_sequence: 0` without claiming chronological ordering. Events include adapter version `0.1.0`; Claude Code's installed version is explicitly marked unverified because the hook payload does not supply it.

The event envelope is validated by `@workspace/core` before `preview` prints it or before a future transport boundary accepts it. `EventTransport` is only a typed interface; no network implementation is provided.
