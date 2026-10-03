import path from "node:path";
import { pathToFileURL } from "node:url";
import { readAdapterConfig, resolveConfigPath } from "./config.js";
import { MAX_HOOK_INPUT_BYTES, assertPathWithinRoot, resolveApprovedRoot } from "./privacy.js";
import { normalizeHookInput, parseHookInput } from "./normalize.js";

const HOOK_TEMPLATE = {
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: "npm",
            args: [
              "run",
              "cli",
              "--workspace",
              "@workspace/adapter",
              "--",
              "hook",
              "--config",
              "${CLAUDE_PROJECT_DIR}/.sharespace/adapter.json",
            ],
            timeout: 5,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: "npm",
            args: [
              "run",
              "cli",
              "--workspace",
              "@workspace/adapter",
              "--",
              "hook",
              "--config",
              "${CLAUDE_PROJECT_DIR}/.sharespace/adapter.json",
            ],
            timeout: 5,
          },
        ],
      },
    ],
  },
};

function printHelp(): void {
  process.stdout.write(`ShareSpace local adapter starter\n\n`);
  process.stdout.write(`Usage: npm run adapter -- <command> [options]\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  help                    Show this help\n`);
  process.stdout.write(
    `  doctor                  Check local runtime readiness without reading configuration or credentials\n`,
  );
  process.stdout.write(
    `  preview [--config PATH] Read one bounded hook JSON object from stdin and show a sanitized local preview\n`,
  );
  process.stdout.write(
    `  hook --config PATH      Validate one hook input for an opt-in Claude command hook; emits no event content\n`,
  );
  process.stdout.write(
    `  hook-template           Print an example settings snippet; does not install it\n\n`,
  );
  process.stdout.write(
    `Sharing is disabled unless an explicit consent configuration enables a category.\n`,
  );
  process.stdout.write(`This starter has no network transport or durable event spool.\n`);
}

function printDoctor(): void {
  process.stdout.write(`ShareSpace adapter doctor\n`);
  process.stdout.write(`Node.js: ${process.versions.node}\n`);
  process.stdout.write(`Configuration or credentials: not read\n`);
  process.stdout.write(`Sharing: disabled for doctor\n`);
  process.stdout.write(`Hook API: docs checked; installed Claude Code version not verified\n`);
  process.stdout.write(`Local event preview: available\n`);
  process.stdout.write(`Spool, pairing, preflight, and network delivery: not implemented\n`);
}

function parseOptions(args: string[]): { configPath?: string } {
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--config") {
      const candidate = args[index + 1];
      if (!candidate || candidate.startsWith("--")) throw new Error("--config requires a path.");
      configPath = candidate;
      index += 1;
    } else if (value === "--help" || value === "-h") {
      printHelp();
      return { configPath: "__help_printed__" };
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  return configPath === undefined ? {} : { configPath };
}

async function readStdinBounded(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("Provide Claude hook JSON through stdin.");
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    byteLength += buffer.byteLength;
    if (byteLength > MAX_HOOK_INPUT_BYTES) throw new Error("Hook input exceeds the 64 KiB limit.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function buildPreview(configPath: string | undefined): Promise<void> {
  const raw = await readStdinBounded();
  const hook = parseHookInput(raw);
  if (!configPath) {
    printJson({
      status: "sharing_disabled",
      supported_event: hook.hook_event_name,
      reason: "explicit_consent_configuration_required",
    });
    return;
  }

  const config = await readAdapterConfig(configPath);
  if (!config.consent.enabled) {
    printJson({
      status: "sharing_disabled",
      supported_event: hook.hook_event_name,
      reason: "explicit_consent_disabled",
    });
    return;
  }

  const root = await resolveApprovedRoot(config.repository_root);
  const hookCwd = typeof hook.cwd === "string" ? hook.cwd : process.cwd();
  const safeCwd = await assertPathWithinRoot(root, hookCwd);
  const processCwd = await assertPathWithinRoot(root, process.cwd());
  const result = await normalizeHookInput({ hook, config, root, cwd: safeCwd });
  if (result.event) {
    printJson({
      status: result.status,
      retry_stable_event_id: result.retryStable,
      ordering:
        "source_sequence is 0 unless a compatible hook supplies it; no monotonic local sequence is persisted",
      event: result.event,
    });
    return;
  }
  printJson({
    status: result.status,
    reason: result.reason,
    repository_root_validated: Boolean(processCwd),
  });
}

async function runHook(configPath: string | undefined): Promise<void> {
  if (!configPath) return;
  try {
    const raw = await readStdinBounded();
    const hook = parseHookInput(raw);
    const config = await readAdapterConfig(configPath);
    if (!config.consent.enabled) return;

    const root = await resolveApprovedRoot(config.repository_root);
    const hookCwd = typeof hook.cwd === "string" ? hook.cwd : process.cwd();
    const safeCwd = await assertPathWithinRoot(root, hookCwd);
    await assertPathWithinRoot(root, process.cwd());
    await normalizeHookInput({ hook, config, root, cwd: safeCwd });
  } catch {
    // This observer never blocks or changes Claude Code behavior when input is invalid or unavailable.
  }
  // Intentionally no stdout or persistence: stdout can become prompt context on UserPromptSubmit.
}

function printHookTemplate(): void {
  printJson(HOOK_TEMPLATE);
  process.stderr.write(
    "Template only. Add it to .claude/settings.local.json manually after reviewing consent and the command path. Exact compatibility with the installed Claude Code version is unverified.\n",
  );
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command = "help", ...rest] = args;
  try {
    if (command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return;
    }
    if (command === "doctor") {
      if (rest.length > 0) throw new Error("doctor does not accept options.");
      printDoctor();
      return;
    }
    if (command === "hook-template") {
      if (rest.length > 0) throw new Error("hook-template does not accept options.");
      printHookTemplate();
      return;
    }
    if (command === "preview") {
      const options = parseOptions(rest);
      if (options.configPath === "__help_printed__") return;
      await buildPreview(resolveConfigPath(options.configPath));
      return;
    }
    if (command === "hook") {
      const options = parseOptions(rest);
      if (options.configPath === "__help_printed__") return;
      await runHook(resolveConfigPath(options.configPath));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected adapter error.";
    process.stderr.write(`adapter: ${message}\n`);
    process.exitCode = 2;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) await main();
