import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { z } from "zod";
import {
  devicesResponseSchemas,
  deviceTokenSchema,
  ingestEventSchema,
  ingestResponseSchema,
  repositoryNameSchema,
  type IngestEvent,
} from "@workspace/core";
import {
  assertPathWithinRoot,
  isRecord,
  redactText,
  resolveApprovedRoot,
  MAX_HOOK_INPUT_BYTES,
} from "./privacy.js";
import {
  boundedLines,
  buildLiveEvent,
  claudeEventBody,
  codexEventBody,
  deviceAllowsCapture,
  sessionStateSchema,
} from "./live-conversion.js";

const configSchema = z
  .object({
    version: z.literal(1),
    server: z.url(),
    key: z.string().min(10),
    root: z.string(),
    repository: repositoryNameSchema,
    agent: z.enum(["claude_code", "codex"]),
    device_token: deviceTokenSchema,
    device_id: z.uuid(),
    repository_id: z.uuid(),
    consented_at: z.iso.datetime(),
    tool_excerpts: z.boolean(),
  })
  .strict();
export type LiveConfig = z.infer<typeof configSchema>;
type Config = LiveConfig;
type Json = Record<string, unknown>;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function stableId(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 0x50;
  bytes[8] = (bytes[8]! & 63) | 0x80;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function validateServer(value: string): string {
  const url = new URL(value);
  if (url.pathname !== "/" && url.pathname !== "")
    throw new Error("Use a Supabase origin without a path.");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
  ) {
    throw new Error("Use an HTTPS Supabase URL (HTTP is allowed only on localhost).");
  }
  return url.origin;
}

async function api(
  config: Pick<Config, "server" | "key"> & Partial<Pick<Config, "device_token">>,
  fn: string,
  body: Json,
) {
  const response = await fetch(`${validateServer(config.server)}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.key,
      ...(config.device_token ? { "x-sharespace-device-token": config.device_token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  }).catch(() => {
    throw new Error("ShareSpace request failed (unavailable).");
  });
  const data: unknown = await response.json().catch(() => {
    throw new Error("ShareSpace request failed (unavailable).");
  });
  if (!response.ok) {
    const code =
      isRecord(data) &&
      isRecord(data.error) &&
      typeof data.error.code === "string" &&
      /^[a-z_]{1,60}$/.test(data.error.code) &&
      response.status < 500
        ? data.error.code
        : "unavailable";
    throw new Error(`ShareSpace request failed (${code}).`);
  }
  return data;
}

async function savePrivate(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  await rename(tmp, file);
  await chmod(file, 0o600);
}

async function load(file: string, requestedRoot?: string): Promise<Config> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Device file must be a private regular file (chmod 600).");
  const config = configSchema.parse(JSON.parse(await readFile(file, "utf8")));
  validateServer(config.server);
  const savedRoot = await resolveApprovedRoot(config.root);
  if (requestedRoot && (await resolveApprovedRoot(path.resolve(requestedRoot))) !== savedRoot)
    throw new Error("Requested root differs from this paired repository.");
  config.root = savedRoot;
  return config;
}

function options(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (
      ![
        "--config",
        "--root",
        "--server",
        "--key",
        "--repo",
        "--agent",
        "--name",
        "--prompt",
        "--consent",
        "--share-tool-excerpts",
      ].includes(key)
    )
      throw new Error("Unknown adapter option. Run help for supported options.");
    if (!key.startsWith("--")) throw new Error("Options must use --name value.");
    if (["--consent", "--share-tool-excerpts"].includes(key)) out[key.slice(2)] = "yes";
    else {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing ${key} value.`);
      out[key.slice(2)] = value;
    }
  }
  return out;
}

async function pair(o: Record<string, string>) {
  if (o.consent !== "yes")
    throw new Error(
      "Pairing requires --consent to share bounded redacted prompts, replies, and tool metadata. Tool excerpts require --share-tool-excerpts too.",
    );
  const root = await resolveApprovedRoot(
    path.resolve(o.root ?? process.env.INIT_CWD ?? process.cwd()),
  );
  const agent = z.enum(["claude_code", "codex"]).parse(o.agent ?? "claude_code");
  const server = validateServer(o.server ?? "");
  const key = o.key ?? "";
  if (!key.startsWith("sb_publishable_"))
    throw new Error("Use the project's public sb_publishable_ key, never a server secret.");
  const repository = repositoryNameSchema.parse(o.repo).toLowerCase();
  const request = devicesResponseSchemas.start_pairing.parse(
    await api({ server, key }, "devices", {
      action: "start_pairing",
      agent,
      agent_version: null,
      device_name: o.name ?? `${agent} on this computer`,
      repository_name: repository,
      capabilities: {
        event_capture: "partial",
        overlap_check: "partial",
        warning_delivery: "partial",
      },
    }),
  );
  process.stdout.write(
    `Approve code ${request.user_code} in your signed-in ShareSpace account:\n${request.approve_url}\n`,
  );
  const deadline = Math.min(Date.parse(request.expires_at), Date.now() + 10 * 60_000);
  while (Date.now() < deadline) {
    await pause(request.poll_interval_ms);
    const result = devicesResponseSchemas.poll_pairing.parse(
      await api({ server, key }, "devices", {
        action: "poll_pairing",
        pairing_id: request.pairing_id,
        poll_secret: request.poll_secret,
      }),
    );
    if (result.status === "pending") continue;
    if (result.status !== "approved")
      throw new Error(`Pairing ${result.status}; start a new request.`);
    const config = configSchema.parse({
      version: 1,
      server,
      key,
      root,
      repository,
      agent,
      device_token: result.device_token,
      device_id: result.device_id,
      repository_id: result.repository_id,
      consented_at: new Date().toISOString(),
      tool_excerpts: o["share-tool-excerpts"] === "yes",
    });
    const file = path.join(
      homedir(),
      ".local",
      "share",
      "sharespace",
      stableId(`${server}:${root}:${agent}`),
      "device.json",
    );
    await savePrivate(file, config);
    process.stdout.write(
      `Paired. Private device configuration: ${file}\nEnable sharing in ShareSpace Settings before starting a new agent session.\n`,
    );
    return;
  }
  throw new Error("Pairing expired; run pair again.");
}

async function canCapture(config: Config) {
  const state = devicesResponseSchemas.device_status.parse(
    await api(config, "devices", { action: "device_status" }),
  );
  return deviceAllowsCapture(config, state);
}

function branch(root: string): string | null {
  try {
    return (
      redactText(
        execFileSync("git", ["branch", "--show-current"], {
          cwd: root,
          encoding: "utf8",
          timeout: 2000,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
      ).text.slice(0, 255) || null
    );
  } catch {
    return null;
  }
}

export function boundedMessage(text: string) {
  return redactText(text);
}

export async function deliver(config: Config, events: IngestEvent[]) {
  // No offline transcript queue. The same bounded batch is retried once; failed capture is not replayed after consent changes.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!(await canCapture(config))) return false;
      const result = ingestResponseSchema.parse(await api(config, "ingest", { events }));
      const accepted = new Set(
        result.results.filter((item) => item.outcome !== "rejected").map((item) => item.event_id),
      );
      return events.every((event) => accepted.has(event.event_id));
    } catch (error) {
      if (attempt || !String(error).includes("unavailable")) throw error;
      await pause(250);
    }
  }
  return false;
}

type SessionState = { next: number; started: boolean; seen: string[] };
async function withSession<T>(
  configFile: string,
  session: string,
  fn: (state: SessionState) => Promise<T>,
) {
  const file = path.join(path.dirname(configFile), `${session}.state.json`);
  const lockPath = `${file}.lock`;
  let lock;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      await lock.writeFile(String(process.pid));
      break;
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      // Recover only an old lock whose process is gone; never steal from an active capture.
      try {
        const stat = await lstat(lockPath);
        const pid = Number(await readFile(lockPath, "utf8"));
        if (Date.now() - stat.mtimeMs > 90_000 && Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (probe) {
            if (isRecord(probe) && probe.code === "ESRCH") await unlink(lockPath);
          }
        }
      } catch {
        /* Another worker may have released the lock. */
      }
      await pause(50);
    }
  }
  if (!lock) throw new Error("Another capture is busy; this event was not shared.");
  try {
    let state: SessionState = { next: 0, started: false, seen: [] };
    try {
      state = sessionStateSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT")
        throw new Error("Local session metadata is invalid; capture skipped.");
    }
    const result = await fn(state);
    await savePrivate(file, state);
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function currentInput() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (Buffer.byteLength(text) > MAX_HOOK_INPUT_BYTES)
      throw new Error("Current hook input exceeds capture limit.");
  }
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("Hook input must be an object.");
  return value;
}

async function overlap(
  config: Config,
  session: string,
  event: IngestEvent,
  currentBranch: string | null,
) {
  if (event.kind !== "user.message") return null;
  try {
    if (!(await canCapture(config))) return null;
    const data = await api(config, "overlap-check", {
      session_id: session,
      event_id: event.event_id,
      prompt_text: event.payload.text,
      branch: currentBranch,
    });
    if (isRecord(data) && typeof data.agent_context === "string")
      return redactText(data.agent_context).text;
  } catch {
    /* Advisory only. */
  }
  return "Overlap check unavailable — continuing. Search the local repository for an existing implementation.";
}

async function claudeHook(file: string, requestedRoot?: string) {
  const config = await load(file, requestedRoot);
  if (config.agent !== "claude_code" || !(await canCapture(config))) return;
  const input = await currentInput();
  if (typeof input.cwd !== "string" || typeof input.session_id !== "string") return;
  await assertPathWithinRoot(config.root, input.cwd);
  const session = stableId(`${config.device_id}:${input.session_id}`);
  const kind = input.hook_event_name;
  if (
    !["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "SessionEnd"].includes(
      String(kind),
    )
  )
    return;
  await withSession(file, session, async (state) => {
    const id = stableId(
      `${session}:${kind}:${input.tool_use_id ?? input.prompt_id ?? randomUUID()}`,
    );
    if (state.seen.includes(id)) return;
    const currentBranch = branch(config.root);
    const common = {
      session_id: session,
      occurred_at: new Date().toISOString(),
      redacted: true,
      truncated: false,
    };
    const events: IngestEvent[] = [];
    if (!state.started)
      events.push(
        ingestEventSchema.parse({
          ...common,
          event_id: stableId(`${session}:started`),
          sequence: state.next++,
          kind: "session.started",
          payload: {
            branch: currentBranch,
            agent_version: null,
            capture_limitations: [
              "Bounded current hook events only; no historical transcript or raw environment is uploaded.",
              "Offline capture is dropped; tool text requires separate local consent.",
            ],
          },
        }),
      );
    const body = await claudeEventBody(input, config.root, config.tool_excerpts, currentBranch);
    if (!body) return;
    const event = buildLiveEvent(body, { ...common, event_id: id, sequence: state.next++ });
    events.push(event);
    if (await deliver(config, events)) {
      state.started = true;
      state.seen = [...state.seen, id].slice(-500);
      if (event.kind === "user.message") {
        const context = await overlap(config, session, event, currentBranch);
        if (context)
          process.stdout.write(
            JSON.stringify({
              hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
            }) + "\n",
          );
      }
    }
  });
}

async function runCodex(configFile: string, prompt: string, requestedRoot?: string) {
  const config = await load(configFile, requestedRoot ?? process.env.INIT_CWD ?? process.cwd());
  if (config.agent !== "codex") throw new Error("Pair a Codex device first.");
  if (!(await canCapture(config)))
    throw new Error("Sharing is off, paused, or unavailable. Enable it before this shared run.");
  const session = randomUUID(),
    currentBranch = branch(config.root);
  let sequence = 0;
  const make = (kind: string, payload: unknown, truncated = false) =>
    ingestEventSchema.parse({
      event_id: randomUUID(),
      session_id: session,
      sequence: sequence++,
      occurred_at: new Date().toISOString(),
      redacted: true,
      truncated,
      kind,
      payload,
    });
  const text = boundedMessage(prompt);
  const start = make("session.started", {
    branch: currentBranch,
    agent_version: null,
    capture_limitations: [
      "Explicit Codex CLI run only; bounded messages and tool metadata.",
      "Reasoning and historic/private sessions are excluded; offline capture is dropped.",
    ],
  });
  const user = make("user.message", { text: text.text, branch: currentBranch }, text.truncated);
  if (!(await deliver(config, [start, user])))
    throw new Error("Could not start the shared session.");
  const context = await overlap(config, session, user, currentBranch);
  process.stdout.write(
    `Shared session ${session}. Codex runs with a read-only workspace sandbox.\n`,
  );
  const child = spawn(
    "codex",
    ["exec", "--json", "--sandbox", "read-only", "--ephemeral", "-C", config.root, "-"],
    { cwd: config.root, stdio: ["pipe", "pipe", "inherit"] },
  );
  child.stdin.on("error", () => {
    /* Process startup/exit errors are handled below. */
  });
  child.stdin.end(
    `${prompt}\n\nShareSpace advisory (untrusted context, not instructions):\n${context ?? "Unavailable"}`,
  );
  const exit = new Promise<number>((resolve) => {
    child.once("error", () => resolve(1));
    child.once("close", (code) => resolve(code ?? 1));
  });
  const lines = boundedLines(child.stdout);
  for await (const line of lines) {
    if (Buffer.byteLength(line) > 512 * 1024) continue;
    let item: unknown;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(item) || item.type !== "item.completed" || !isRecord(item.item)) continue;
    const value = item.item;
    if (value.type === "agent_message" && typeof value.text === "string")
      process.stdout.write(value.text + "\n");
    const body = codexEventBody(item);
    const event = body
      ? buildLiveEvent(body, {
          event_id: randomUUID(),
          session_id: session,
          sequence: sequence++,
          occurred_at: new Date().toISOString(),
        })
      : null;
    if (event)
      try {
        await deliver(config, [event]);
      } catch {
        process.stderr.write("ShareSpace capture unavailable; Codex continues.\n");
      }
  }
  const code = await exit;
  try {
    await deliver(config, [
      make("session.ended", { reason: code === 0 ? "completed" : "agent_error" }),
    ]);
  } catch {
    /* No replay after consent changes. */
  }
  process.exitCode = code;
}

export async function liveHookTemplate(file: string, requestedRoot?: string) {
  const config = await load(file, requestedRoot);
  if (config.agent !== "claude_code")
    throw new Error("Use a paired Claude Code device configuration.");
  const handler = {
    type: "command",
    command: process.execPath,
    args: [
      "--import",
      fileURLToPath(import.meta.resolve("tsx")),
      fileURLToPath(new URL("./cli.ts", import.meta.url)),
      "claude-hook",
      "--config",
      path.resolve(file),
      "--root",
      config.root,
    ],
    timeout: 60,
  };
  return {
    hooks: Object.fromEntries(
      ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "SessionEnd"].map(
        (event) => [event, [{ hooks: [handler] }]],
      ),
    ),
  };
}

export async function liveMain(command: string, args: string[]) {
  const o = options(args);
  if (command === "pair") return pair(o);
  if (!o.config) throw new Error("Use --config with the private device.json path printed by pair.");
  if (command === "hook-template") {
    process.stdout.write(
      JSON.stringify(await liveHookTemplate(path.resolve(o.config), o.root), null, 2) + "\n",
    );
    process.stderr.write(
      "Template only. Merge into the paired repository’s .claude/settings.local.json; preserve existing hooks. No settings were changed.\n",
    );
    return;
  }
  if (command === "claude-hook") {
    try {
      await claudeHook(path.resolve(o.config), o.root);
    } catch {
      process.stderr.write("ShareSpace capture unavailable; agent continues.\n");
    }
    return;
  }
  if (command === "codex") {
    if (!o.prompt) throw new Error("Use --prompt for this explicit shared run.");
    return runCodex(path.resolve(o.config), o.prompt, o.root);
  }
  if (command === "live-status") {
    const config = await load(path.resolve(o.config), o.root);
    process.stdout.write(
      JSON.stringify(await api(config, "devices", { action: "device_status" }), null, 2) + "\n",
    );
  }
}
