import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAdapterConfig, type AdapterConfig } from "./config.js";
import { normalizeHookInput, parseHookInput } from "./normalize.js";
import { redactText, redactValue, resolveApprovedRoot, toSafeRelativePath } from "./privacy.js";

const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sharespace-adapter-"));
  temporaryDirectories.push(directory);
  return directory;
}

function consentedConfig(
  repositoryRoot: string,
  overrides: Partial<AdapterConfig["consent"]["categories"]> = {},
): AdapterConfig {
  return parseAdapterConfig({
    schema_version: 1,
    repository_root: repositoryRoot,
    consent: {
      enabled: true,
      version: 1,
      consented_at: "2026-10-03T12:00:00.000Z",
      categories: {
        user_prompts: true,
        tool_metadata: true,
        tool_excerpts: false,
        ...overrides,
      },
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("adapter input boundaries", () => {
  it("rejects malformed, unsupported, and oversized hook input", () => {
    expect(() => parseHookInput("{")).toThrow("valid JSON");
    expect(() =>
      parseHookInput(JSON.stringify({ hook_event_name: "Stop", session_id: "demo" })),
    ).toThrow("Unsupported");
    expect(() => parseHookInput("x".repeat(64 * 1024 + 1))).toThrow("64 KiB");
  });

  it("rejects unknown configuration fields that could carry credentials", () => {
    expect(() =>
      parseAdapterConfig({
        schema_version: 1,
        repository_root: "/tmp/project",
        token: "do-not-store",
        consent: {
          enabled: false,
          version: 1,
          consented_at: null,
          categories: { user_prompts: false, tool_metadata: false, tool_excerpts: false },
        },
      }),
    ).toThrow("invalid");
  });
});

describe("local consent and event normalization", () => {
  it("keeps sharing disabled unless the config explicitly enables it", async () => {
    const rootPath = await makeTemporaryDirectory();
    const root = await resolveApprovedRoot(rootPath);
    const disabled = parseAdapterConfig({
      schema_version: 1,
      repository_root: rootPath,
      consent: {
        enabled: false,
        version: 1,
        consented_at: null,
        categories: { user_prompts: true, tool_metadata: true, tool_excerpts: false },
      },
    });
    const hook = parseHookInput(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "synthetic-session",
        prompt_id: "550e8400-e29b-41d4-a716-446655440000",
        cwd: rootPath,
        prompt: "synthetic private prompt text",
      }),
    );

    const result = await normalizeHookInput({ hook, config: disabled, root, cwd: root });
    expect(result.status).toBe("sharing_disabled");
    expect(result.event).toBeUndefined();
  });

  it("creates the same event ID for retries with a stable Claude source ID", async () => {
    const rootPath = await makeTemporaryDirectory();
    const root = await resolveApprovedRoot(rootPath);
    const config = consentedConfig(rootPath);
    const hook = parseHookInput(
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "synthetic-session",
        prompt_id: "550e8400-e29b-41d4-a716-446655440000",
        cwd: rootPath,
        prompt: "A harmless synthetic prompt.",
      }),
    );

    const first = await normalizeHookInput({
      hook,
      config,
      root,
      cwd: root,
      now: new Date("2026-10-03T12:00:00.000Z"),
    });
    const retry = await normalizeHookInput({
      hook,
      config,
      root,
      cwd: root,
      now: new Date("2026-10-03T12:01:00.000Z"),
    });
    expect(first.retryStable).toBe(true);
    expect(retry.retryStable).toBe(true);
    expect(first.event?.event_id).toBe(retry.event?.event_id);
    expect(first.event?.session_id).toBe(retry.event?.session_id);
    expect(first.event?.source_sequence).toBe(0);
  });

  it("does not include arbitrary shell output unless tool excerpt consent is enabled", async () => {
    const rootPath = await makeTemporaryDirectory();
    const root = await resolveApprovedRoot(rootPath);
    const config = consentedConfig(rootPath);
    const hook = parseHookInput(
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "synthetic-session",
        cwd: rootPath,
        tool_name: "Bash",
        tool_input: { command: "echo synthetic private output" },
        tool_response: { stdout: "synthetic private output", stderr: "" },
        tool_use_id: "toolu_synthetic_0001",
      }),
    );

    const result = await normalizeHookInput({ hook, config, root, cwd: root });
    expect(result.event?.payload).not.toHaveProperty("result_excerpt");
    expect(JSON.stringify(result.event)).not.toContain("synthetic private output");
  });
});

describe("path and redaction safeguards", () => {
  it("keeps only relative paths under the approved root and rejects traversal", async () => {
    const rootPath = await makeTemporaryDirectory();
    const root = await resolveApprovedRoot(rootPath);
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "secrets"));
    const relative = await toSafeRelativePath({ root, cwd: root, candidate: "src/new-file.ts" });
    const sensitive = await toSafeRelativePath({ root, cwd: root, candidate: "secrets/key.txt" });

    expect(relative).toBe("src/new-file.ts");
    expect(sensitive).toBeUndefined();
    await expect(
      toSafeRelativePath({ root, cwd: root, candidate: "../outside.txt" }),
    ).rejects.toThrow();
    await expect(
      toSafeRelativePath({
        root,
        cwd: root,
        candidate: path.join(path.dirname(root), "outside.txt"),
      }),
    ).rejects.toThrow();
  });

  it("rejects symlinks that resolve outside the approved root", async () => {
    const rootPath = await makeTemporaryDirectory();
    const outsidePath = await makeTemporaryDirectory();
    const root = await resolveApprovedRoot(rootPath);
    await symlink(outsidePath, path.join(root, "linked-out"));

    await expect(
      toSafeRelativePath({ root, cwd: root, candidate: "linked-out/private.txt" }),
    ).rejects.toThrow();
  });

  it("redacts common credential patterns, absolute paths, and secret-named object keys", () => {
    const text = redactText("Bearer abcdefghijklmnop at /Users/synthetic/private/file.txt");
    const nested = redactValue({
      message: "token=syntheticsecretvalue",
      credentials: { nested: "must not survive" },
    });

    expect(text.text).not.toContain("abcdefghijklmnop");
    expect(text.text).not.toContain("/Users/synthetic");
    expect(JSON.stringify(nested)).not.toContain("syntheticsecretvalue");
    expect(JSON.stringify(nested)).not.toContain("must not survive");
  });
});
