import { createHash, randomUUID } from "node:crypto";
import { eventEnvelopeSchema } from "@workspace/core";
import type { AdapterConfig } from "./config.js";
import {
  assertPathWithinRoot,
  isRecord,
  MAX_EXCERPT_CHARS,
  MAX_HOOK_INPUT_BYTES,
  MAX_RELATIVE_PATHS,
  redactText,
  redactValue,
  resolveApprovedRoot,
  toSafeRelativePath,
} from "./privacy.js";

const ADAPTER_VERSION = "0.1.0";
const UUID_NAMESPACE = "c84b17fd-69c3-5ef7-8d17-741f6b4f3a2d";
const SUPPORTED_EVENTS = new Set(["UserPromptSubmit", "PostToolUse"]);
const SAFE_TOOL_NAMES = new Set([
  "Bash",
  "Edit",
  "Glob",
  "Grep",
  "MultiEdit",
  "NotebookEdit",
  "Read",
  "Write",
]);

export interface ClaudeHookInput extends Record<string, unknown> {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
}

export interface NormalizeResult {
  status: "normalized" | "sharing_disabled" | "unsupported_event" | "category_not_consented";
  reason?: string;
  event?: ReturnType<typeof eventEnvelopeSchema.parse>;
  retryStable: boolean;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function uuidBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function uuidV5(namespace: string, name: string): string {
  const hash = createHash("sha1")
    .update(uuidBytes(namespace))
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(hash);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) return undefined;
  return value;
}

export function parseHookInput(raw: string): ClaudeHookInput {
  if (Buffer.byteLength(raw, "utf8") > MAX_HOOK_INPUT_BYTES)
    throw new Error("Hook input exceeds the 64 KiB limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Hook input must contain valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("Hook input must be a JSON object.");
  if (!SUPPORTED_EVENTS.has(String(parsed.hook_event_name)))
    throw new Error("Unsupported Claude Code hook event.");
  if (!boundedString(parsed.session_id, 128))
    throw new Error("Hook input is missing a valid session identifier.");
  if (parsed.cwd !== undefined && !boundedString(parsed.cwd, 2048))
    throw new Error("Hook input has an invalid working directory.");
  if (parsed.hook_event_name === "UserPromptSubmit" && typeof parsed.prompt !== "string") {
    throw new Error("UserPromptSubmit input is missing its prompt field.");
  }
  if (
    parsed.hook_event_name === "PostToolUse" &&
    (!boundedString(parsed.tool_name, 100) || !isRecord(parsed.tool_input))
  ) {
    throw new Error("PostToolUse input is missing tool metadata.");
  }
  return parsed as ClaudeHookInput;
}

function eventSourceId(hook: ClaudeHookInput): string | undefined {
  if (hook.hook_event_name === "UserPromptSubmit") return boundedString(hook.prompt_id, 128);
  return boundedString(hook.tool_use_id, 128);
}

function getAllowedToolName(value: unknown): string {
  if (typeof value === "string" && SAFE_TOOL_NAMES.has(value)) return value;
  return "Other";
}

function collectToolPathCandidates(
  toolInput: Record<string, unknown>,
  toolResponse: unknown,
): string[] {
  const candidates: string[] = [];
  for (const key of ["file_path", "path", "notebook_path", "destination"]) {
    const value = toolInput[key];
    if (typeof value === "string") candidates.push(value);
  }
  if (isRecord(toolResponse) && typeof toolResponse.filePath === "string")
    candidates.push(toolResponse.filePath);
  return candidates;
}

function collectToolExcerpt(toolName: string, toolResponse: unknown): string | undefined {
  if (toolName === "Bash" && isRecord(toolResponse)) {
    const parts = [toolResponse.stdout, toolResponse.stderr].filter(
      (part): part is string => typeof part === "string",
    );
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  if (typeof toolResponse === "string") return toolResponse;
  if (isRecord(toolResponse) && typeof toolResponse.content === "string")
    return toolResponse.content;
  return undefined;
}

function normalizedSourceId(
  hook: ClaudeHookInput,
  sourceId: string | undefined,
): { eventId: string; retryStable: boolean } {
  const sessionUuid = uuidV5(UUID_NAMESPACE, hook.session_id);
  if (!sourceId) return { eventId: randomUUID(), retryStable: false };
  const eventId = uuidV5(sessionUuid, `${hook.hook_event_name}:${sourceId}`);
  return { eventId, retryStable: true };
}

export async function normalizeHookInput(options: {
  hook: ClaudeHookInput;
  config: AdapterConfig;
  root: string;
  cwd: string;
  now?: Date;
}): Promise<NormalizeResult> {
  const { hook, config, root, cwd } = options;
  if (!config.consent.enabled)
    return { status: "sharing_disabled", reason: "explicit_consent_disabled", retryStable: false };
  if (!SUPPORTED_EVENTS.has(hook.hook_event_name))
    return { status: "unsupported_event", reason: "unsupported_hook_event", retryStable: false };

  if (hook.hook_event_name === "UserPromptSubmit" && !config.consent.categories.user_prompts) {
    return {
      status: "category_not_consented",
      reason: "user_prompts_not_consented",
      retryStable: false,
    };
  }
  if (hook.hook_event_name === "PostToolUse" && !config.consent.categories.tool_metadata) {
    return {
      status: "category_not_consented",
      reason: "tool_metadata_not_consented",
      retryStable: false,
    };
  }

  const approvedRoot = await resolveApprovedRoot(root);
  const safeCwd = await assertPathWithinRoot(approvedRoot, hook.cwd ?? cwd);
  await assertPathWithinRoot(approvedRoot, cwd);
  const eventTime = (options.now ?? new Date()).toISOString();
  const ids = normalizedSourceId(hook, eventSourceId(hook));
  const sessionId = uuidV5(UUID_NAMESPACE, hook.session_id);
  const payload: Record<string, unknown> = {
    redacted: true,
    source: "claude_code_hook",
    source_event: hook.hook_event_name,
    adapter_version: ADAPTER_VERSION,
    agent: "Claude Code",
    agent_version: null,
    agent_version_status: "unverified",
    consent_version: config.consent.version,
    truncated: false,
  };
  let kind: "user.message" | "tool.completed";

  if (hook.hook_event_name === "UserPromptSubmit") {
    kind = "user.message";
    const prompt = typeof hook.prompt === "string" ? hook.prompt : "";
    if (config.consent.categories.user_prompts) {
      const excerpt = redactText(prompt);
      payload.prompt_excerpt = excerpt.text;
      payload.prompt_redacted = excerpt.changed;
      payload.truncated = excerpt.truncated;
    }
  } else {
    kind = "tool.completed";
    const toolInput = isRecord(hook.tool_input) ? hook.tool_input : {};
    const displayToolName = getAllowedToolName(hook.tool_name);
    payload.tool_name = displayToolName;
    payload.status = "success";
    if (typeof hook.tool_use_id === "string" && hook.tool_use_id.length <= 128)
      payload.tool_call_id = hook.tool_use_id;
    if (
      typeof hook.duration_ms === "number" &&
      Number.isSafeInteger(hook.duration_ms) &&
      hook.duration_ms >= 0
    ) {
      payload.duration_ms = hook.duration_ms;
    }

    const candidatePaths = collectToolPathCandidates(toolInput, hook.tool_response);
    const safePaths = new Set<string>();
    for (const candidate of candidatePaths) {
      const relativePath = await toSafeRelativePath({
        root: approvedRoot,
        cwd: safeCwd,
        candidate,
      });
      if (relativePath) safePaths.add(relativePath);
    }
    if (safePaths.size > 0)
      payload.relative_paths = [...safePaths].sort().slice(0, MAX_RELATIVE_PATHS);
    if (candidatePaths.length > safePaths.size) payload.paths_filtered = true;
    if (safePaths.size > MAX_RELATIVE_PATHS) payload.paths_truncated = true;

    if (config.consent.categories.tool_excerpts) {
      const excerptRaw = collectToolExcerpt(displayToolName, hook.tool_response);
      if (excerptRaw !== undefined) {
        const excerpt = redactText(excerptRaw);
        payload.result_excerpt = excerpt.text.slice(0, MAX_EXCERPT_CHARS);
        payload.result_redacted = excerpt.changed;
        payload.truncated = excerpt.truncated;
      }
    }
  }

  const sequenceHint =
    typeof hook.source_sequence === "number" &&
    Number.isSafeInteger(hook.source_sequence) &&
    hook.source_sequence >= 0
      ? hook.source_sequence
      : 0;
  const candidate = {
    schema_version: 1,
    event_id: ids.eventId,
    session_id: sessionId,
    source_sequence: sequenceHint,
    kind,
    occurred_at: eventTime,
    payload: redactValue(payload),
  };
  const parsed = eventEnvelopeSchema.safeParse(candidate);
  if (!parsed.success)
    throw new Error("Sanitized hook event did not match the shared event contract.");

  return { status: "normalized", event: parsed.data, retryStable: ids.retryStable };
}

export function stableSessionId(claudeSessionId: string): string {
  return uuidV5(UUID_NAMESPACE, claudeSessionId);
}

export function isStandardUuid(value: string): boolean {
  return isUuid(value);
}
