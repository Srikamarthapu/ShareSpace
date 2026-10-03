import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundedLines,
  buildLiveEvent,
  claudeEventBody,
  codexEventBody,
  deviceAllowsCapture,
} from "./live-conversion.js";
import { deliver, liveHookTemplate, stableId, type LiveConfig } from "./live.js";
import { redactText, resolveApprovedRoot } from "./privacy.js";

const dirs: string[] = [];
async function temp() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sharespace-live-"));
  dirs.push(root);
  return resolveApprovedRoot(root);
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(dirs.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const id = "10000000-0000-4000-8000-000000000001",
  repo = "10000000-0000-4000-8000-000000000002";
const state = {
  device_id: id,
  repository_id: repo,
  sharing: { enabled: true, paused: false },
  storage_state: "ok",
};
function config(root = "/tmp"): LiveConfig {
  return {
    version: 1,
    server: "https://example.supabase.co",
    key: "sb_publishable_synthetic",
    root,
    repository: "acme/demo",
    agent: "claude_code",
    device_token: `ssd-${"a".repeat(64)}`,
    device_id: id,
    repository_id: repo,
    consented_at: "2026-10-03T12:00:00Z",
    tool_excerpts: false,
  };
}
function event() {
  return buildLiveEvent(
    {
      kind: "user.message",
      payload: { text: "Implement a counter", branch: "demo" },
      truncated: false,
    },
    {
      event_id: stableId("message"),
      session_id: stableId("session"),
      sequence: 0,
      occurred_at: "2026-10-03T12:00:00Z",
    },
  );
}
const response = (body: unknown, status = 200) => Response.json(body, { status });

describe("live capture privacy boundaries", () => {
  it("excludes sensitive paths, outside roots, and symlink escapes before an excerpt is generated", async () => {
    const root = await temp(),
      outside = await temp();
    await mkdir(path.join(root, "src"));
    await symlink(outside, path.join(root, "escape"));
    const input = {
      hook_event_name: "PostToolUse",
      cwd: root,
      tool_name: "Read",
      tool_response: "private value",
      tool_input: { file_path: path.join(root, ".env.local") },
    };
    expect(await claudeEventBody(input, root, true, null)).toBeNull();
    await expect(
      claudeEventBody(
        { ...input, tool_input: { file_path: path.join(outside, "secret.txt") } },
        root,
        true,
        null,
      ),
    ).rejects.toThrow("path_outside_root");
    await expect(
      claudeEventBody(
        { ...input, tool_input: { file_path: path.join(root, "escape", "secret.txt") } },
        root,
        true,
        null,
      ),
    ).rejects.toThrow("symlink_outside_root");
    await expect(claudeEventBody({ ...input, cwd: outside }, root, true, null)).rejects.toThrow(
      "path_outside_root",
    );
  });
  it("allows only separately consented file-tool text from a validated path", async () => {
    const root = await temp();
    const input = {
      hook_event_name: "PostToolUse",
      cwd: root,
      tool_name: "Read",
      tool_response: "A harmless source comment",
      tool_input: { file_path: path.join(root, "README.md") },
      environment: { SECRET: "never copy" },
      transcript_path: "/private/history",
    };
    expect(await claudeEventBody(input, root, false, null)).toMatchObject({
      payload: { output_excerpt: null, relative_paths: ["README.md"] },
    });
    const body = await claudeEventBody(input, root, true, null);
    expect(body).toMatchObject({ payload: { output_excerpt: "A harmless source comment" } });
    expect(JSON.stringify(body)).not.toMatch(/never copy|transcript_path|environment/);
  });
  it("never copies shell commands, shell output, or MCP output even with excerpt consent", async () => {
    const root = await temp();
    const shell = await claudeEventBody(
      {
        hook_event_name: "PostToolUse",
        cwd: root,
        tool_name: "Bash",
        tool_input: { command: "printenv" },
        tool_response: { stdout: "UNCLASSIFIED_PRIVATE_VALUE" },
      },
      root,
      true,
      null,
    );
    expect(shell).toMatchObject({ payload: { tool_name: "Bash", output_excerpt: null } });
    expect(JSON.stringify(shell)).not.toMatch(/printenv|UNCLASSIFIED/);
    const mcp = await claudeEventBody(
      {
        hook_event_name: "PostToolUse",
        cwd: root,
        tool_name: "mcp__private_server",
        tool_response: "PRIVATE_VALUE",
      },
      root,
      true,
      null,
    );
    expect(mcp).toMatchObject({ payload: { tool_name: "Other", output_excerpt: null } });
  });
  it("captures current Stop text without ever reading the transcript", async () => {
    const root = await temp();
    const body = await claudeEventBody(
      {
        hook_event_name: "Stop",
        cwd: root,
        last_assistant_message: "Current response",
        transcript_path: "/nonexistent/private/transcript",
      },
      root,
      false,
      null,
    );
    expect(body).toEqual({
      kind: "assistant.message",
      payload: { text: "Current response" },
      truncated: false,
    });
  });
  it("redacts test/live provider tokens, assignments, and personal paths with spaces", () => {
    const text = redactText(
      `sk-${"a".repeat(32)} rk_test_synthetic PRIVATE_VALUE="unclassified string" /Volumes/My Disk/private/source.ts`,
    ).text;
    expect(text).not.toMatch(/synthetic|aaaa|unclassified|My Disk|source.ts/);
  });
  it("drops Codex reasoning and emits only bounded messages or shell metadata", () => {
    expect(
      codexEventBody({
        type: "item.completed",
        item: { type: "reasoning", text: "private reasoning" },
      }),
    ).toBeNull();
    expect(
      codexEventBody({ type: "item.started", item: { type: "agent_message", text: "unfinished" } }),
    ).toBeNull();
    const shell = codexEventBody({
      type: "item.completed",
      item: {
        type: "command_execution",
        id: "item_1",
        command: "cat ~/.ssh/private",
        aggregated_output: "NEVERUPLOAD",
        exit_code: 0,
      },
    });
    expect(shell).toMatchObject({ payload: { tool_name: "Shell", output_excerpt: null } });
    expect(JSON.stringify(shell)).not.toMatch(/NEVERUPLOAD|cat ~|ssh/);
    expect(
      codexEventBody({
        type: "item.completed",
        item: { type: "agent_message", text: "x".repeat(1000) },
      }),
    ).toMatchObject({ truncated: true });
  });
  it("does not buffer or forward oversized JSON lines and recovers at the next newline", async () => {
    async function* chunks() {
      yield Buffer.from("x".repeat(20));
      yield Buffer.from("x".repeat(20) + '\n{"ok":true}\n');
    }
    const seen = [];
    for await (const line of boundedLines(chunks(), 32)) seen.push(line);
    expect(seen).toEqual(['{"ok":true}']);
  });
});

describe("consent, delivery and hook setup", () => {
  it("blocks wrong-device, wrong-repository, paused, disabled, and unknown-capacity status", () => {
    expect(deviceAllowsCapture(config(), state)).toBe(true);
    for (const change of [
      { device_id: repo },
      { repository_id: id },
      { sharing: { enabled: false, paused: false } },
      { sharing: { enabled: true, paused: true } },
      { storage_state: "unknown" },
      { storage_state: "paused" },
    ])
      expect(deviceAllowsCapture(config(), { ...state, ...change })).toBe(false);
  });
  it("rechecks access before retrying and keeps the exact event ID and payload", async () => {
    const e = event();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(state))
      .mockRejectedValueOnce(new TypeError("network failed"))
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(
        response({
          results: [{ event_id: e.event_id, outcome: "accepted" }],
          sharing: state.sharing,
          storage_state: "ok",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await deliver(config(), [e])).toBe(true);
    expect(fetcher.mock.calls[1]?.[1].body).toBe(fetcher.mock.calls[3]?.[1].body);
    expect(fetcher.mock.calls.map((call) => String(call[0]).split("/").at(-1))).toEqual([
      "devices",
      "ingest",
      "devices",
      "ingest",
    ]);
  });
  it("drops a retry when sharing pauses, without another upload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response({ error: { code: "unavailable" } }, 503))
      .mockResolvedValueOnce(response({ ...state, sharing: { enabled: true, paused: true } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await deliver(config(), [event()])).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not retry revoked device credentials or invent acceptance from missing results", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ error: { code: "device_revoked" } }, 401));
    vi.stubGlobal("fetch", fetcher);
    await expect(deliver(config(), [event()])).rejects.toThrow("device_revoked");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(
        response({ results: [], sharing: state.sharing, storage_state: "ok" }),
      );
    expect(await deliver(config(), [event()])).toBe(false);
  });
  it("generates a live template independent of npm workspace cwd and refuses a different root", async () => {
    const root = await temp(),
      other = await temp();
    const file = path.join(root, "device.json");
    await writeFile(file, JSON.stringify(config(root)), { mode: 0o600 });
    const template = await liveHookTemplate(file, root);
    expect(Object.keys(template.hooks)).toEqual([
      "UserPromptSubmit",
      "PostToolUse",
      "PostToolUseFailure",
      "Stop",
      "SessionEnd",
    ]);
    const handler = template.hooks.UserPromptSubmit?.[0]?.hooks[0];
    expect(handler?.command).toBe(process.execPath);
    expect(handler?.args).toContain("claude-hook");
    expect(handler?.args).toContain(root);
    await expect(liveHookTemplate(file, other)).rejects.toThrow("differs");
    await chmod(file, 0o644);
    await expect(liveHookTemplate(file, root)).rejects.toThrow("private regular");
  });
});
