import { z } from "zod";
import { ingestEventSchema, type IngestEvent } from "@workspace/core";
import { assertPathWithinRoot, isRecord, redactText, toSafeRelativePath } from "./privacy.js";

export type LiveEventBody = Pick<IngestEvent, "kind" | "payload" | "truncated">;
const fileTools = new Set(["Read", "Edit", "Write", "NotebookEdit"]);
const knownTools = new Set([
  ...fileTools,
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Agent",
  "Task",
]);

export async function claudeEventBody(
  input: Record<string, unknown>,
  root: string,
  excerpts: boolean,
  branch: string | null,
): Promise<LiveEventBody | null> {
  if (typeof input.cwd !== "string") return null;
  const cwd = await assertPathWithinRoot(root, input.cwd);
  const kind = input.hook_event_name;
  if (kind === "UserPromptSubmit" && typeof input.prompt === "string") {
    const safe = redactText(input.prompt);
    return {
      kind: "user.message",
      payload: { text: safe.text, branch },
      truncated: safe.truncated,
    };
  }
  if (kind === "Stop" && typeof input.last_assistant_message === "string") {
    const safe = redactText(input.last_assistant_message);
    return { kind: "assistant.message", payload: { text: safe.text }, truncated: safe.truncated };
  }
  if (kind === "SessionEnd")
    return { kind: "session.ended", payload: { reason: "agent_session_ended" }, truncated: false };
  if (kind !== "PostToolUse" && kind !== "PostToolUseFailure") return null;
  const name =
    typeof input.tool_name === "string" && knownTools.has(input.tool_name)
      ? input.tool_name
      : "Other";
  const paths: string[] = [];
  if (isRecord(input.tool_input))
    for (const key of ["file_path", "path", "notebook_path"]) {
      const candidate = input.tool_input[key];
      if (typeof candidate !== "string") continue;
      const safe = await toSafeRelativePath({ root, cwd, candidate });
      if (!safe) return null;
      paths.push(safe);
    }
  // Shell and MCP output may contain environment values or files beyond this repository.
  // Text consent alone cannot establish that scope, so those events are metadata-only.
  let excerpt: ReturnType<typeof redactText> | null = null;
  if (excerpts && fileTools.has(name) && paths.length && typeof input.tool_response === "string")
    excerpt = redactText(input.tool_response);
  return {
    kind: "tool.completed",
    truncated: excerpt?.truncated ?? false,
    payload: {
      tool_call_id:
        typeof input.tool_use_id === "string"
          ? redactText(input.tool_use_id).text.slice(0, 128)
          : null,
      tool_name: name,
      status: kind === "PostToolUseFailure" ? "error" : "success",
      output_excerpt: excerpt?.text ?? null,
      relative_paths: [...new Set(paths)],
      duration_ms: null,
    },
  };
}

export function codexEventBody(raw: unknown): LiveEventBody | null {
  if (!isRecord(raw) || raw.type !== "item.completed" || !isRecord(raw.item)) return null;
  const item = raw.item;
  if (item.type === "agent_message" && typeof item.text === "string") {
    const safe = redactText(item.text);
    return { kind: "assistant.message", payload: { text: safe.text }, truncated: safe.truncated };
  }
  if (item.type === "command_execution")
    return {
      kind: "tool.completed",
      truncated: false,
      payload: {
        tool_call_id: typeof item.id === "string" ? redactText(item.id).text.slice(0, 128) : null,
        tool_name: "Shell",
        status: item.exit_code === 0 ? "success" : "error",
        output_excerpt: null,
        relative_paths: [],
        duration_ms: null,
      },
    };
  // Reasoning, raw commands, environment, historical sessions and arbitrary MCP objects are never shared.
  return null;
}

export function buildLiveEvent(
  body: LiveEventBody,
  common: { event_id: string; session_id: string; sequence: number; occurred_at: string },
): IngestEvent {
  return ingestEventSchema.parse({ ...common, redacted: true, ...body });
}

export function deviceAllowsCapture(
  config: { device_id: string; repository_id: string },
  state: {
    device_id: string;
    repository_id: string;
    sharing: { enabled: boolean; paused: boolean };
    storage_state: string;
  },
) {
  return (
    state.device_id === config.device_id &&
    state.repository_id === config.repository_id &&
    state.sharing.enabled &&
    !state.sharing.paused &&
    !["paused", "unknown"].includes(state.storage_state)
  );
}

export const sessionStateSchema = z
  .object({
    next: z.number().int().nonnegative(),
    started: z.boolean(),
    seen: z.array(z.uuid()).max(500),
  })
  .strict();

export async function* boundedLines(
  stream: AsyncIterable<Buffer | string>,
  maxBytes = 512 * 1024,
): AsyncGenerator<string> {
  let pieces: Buffer[] = [],
    bytes = 0,
    dropping = false;
  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    while (start < data.length) {
      const end = data.indexOf(10, start);
      const part = data.subarray(start, end < 0 ? data.length : end);
      bytes += part.length;
      if (bytes > maxBytes) {
        pieces = [];
        dropping = true;
      }
      if (!dropping) pieces.push(part);
      if (end < 0) break;
      if (!dropping) yield Buffer.concat(pieces).toString("utf8").replace(/\r$/, "");
      pieces = [];
      bytes = 0;
      dropping = false;
      start = end + 1;
    }
  }
  if (!dropping && bytes) yield Buffer.concat(pieces).toString("utf8");
}
