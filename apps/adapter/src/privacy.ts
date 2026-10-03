import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export const MAX_HOOK_INPUT_BYTES = 64 * 1024;
export const MAX_EXCERPT_CHARS = 280;
export const MAX_RELATIVE_PATHS = 12;

const SENSITIVE_KEY_PATTERN =
  /(?:^|_)(authorization|auth|api_?key|access_token|refresh_token|token|password|passwd|secret|private_key|credentials?|environment|env|transcript|cookie|raw_prompt|raw_command|tool_input|tool_response|command|arguments?|tool_args|command_args|stdout|stderr|output)(?:_|$)/i;

const TOKEN_PATTERNS = [
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\b[A-Z][A-Z0-9_]{2,}\s*=\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/g,
  /\b(?:ss[idp]-[0-9a-f]{64}|[sr]k_(?:test|live)_[A-Za-z0-9]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+)\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}/gi,
  /\b(?:sk-(?:ant|proj|live|test)-|github_pat_|gh[pousr]_|xox[baprs]-|npm_)[A-Za-z0-9_-]{12,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[\w-]*(?:api[_-]?key|token|password|secret|authorization)\b\s*[:=]\s*["']?[^\s,"'}]+/gi,
];

const POSIX_ABSOLUTE_PATH_PATTERN =
  /(^|[\s"'=([{])\/(?!\/)(?:[A-Za-z0-9._~+-]+\/)*[A-Za-z0-9._~+-]+/g;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /\b[A-Za-z]:\\(?:[^\\\s"'<>|]+\\)*[^\\\s"'<>|]*/g;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactText(input: string): { text: string; changed: boolean; truncated: boolean } {
  let text = input.replace(/\u0000/g, "");
  let changed = text !== input;
  for (const pattern of TOKEN_PATTERNS) {
    const next = text.replace(pattern, "[REDACTED]");
    changed ||= next !== text;
    text = next;
  }
  const personalPaths = text.replace(
    /(^|[\s"'=([{])\/(?:Users|home|Volumes|private|tmp)\/[^"'\r\n,;]+/g,
    "$1[PATH]",
  );
  changed ||= personalPaths !== text;
  text = personalPaths;
  const withoutPosixPaths = text.replace(POSIX_ABSOLUTE_PATH_PATTERN, "$1[PATH]");
  changed ||= withoutPosixPaths !== text;
  text = withoutPosixPaths;
  const withoutWindowsPaths = text.replace(WINDOWS_ABSOLUTE_PATH_PATTERN, "[PATH]");
  changed ||= withoutWindowsPaths !== text;
  text = withoutWindowsPaths;

  const truncated = text.length > MAX_EXCERPT_CHARS;
  if (truncated) text = `${text.slice(0, MAX_EXCERPT_CHARS)}…`;
  return { text, changed, truncated };
}

export function redactValue(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return redactText(value).text;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (!isRecord(value)) return "[OMITTED]";

  const output: Record<string, JsonValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9]+/g, "_");
    if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) continue;
    output[key] = redactValue(nested);
  }
  return output;
}

export function isSensitiveRelativePath(relativePath: string): boolean {
  const components = relativePath.split("/").map((component) => component.toLowerCase());
  const sensitiveNames = new Set([
    ".aws",
    ".sharespace",
    ".claude",
    ".codex",
    ".env",
    ".git",
    ".gnupg",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".ssh",
    ".secrets",
    ".next",
    ".turbo",
    ".cache",
    "build",
    "coverage",
    "dist",
    "generated",
    "node_modules",
    "secrets",
    "target",
    "tmp",
    "temp",
    "vendor",
  ]);
  if (components.some((component) => sensitiveNames.has(component))) return true;
  return components.some((component) =>
    /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\..*)?|secrets?\..*|.*\.(?:pem|key|p12|pfx|jks))$/i.test(
      component,
    ),
  );
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function safeRelativeComponents(relative: string): string[] | undefined {
  const components = relative.split(path.sep);
  if (components.some((component) => component === "" || component === "." || component === ".."))
    return undefined;
  return components;
}

async function resolveExistingPathSafely(root: string, absolutePath: string): Promise<string> {
  if (!isWithinRoot(root, absolutePath)) throw new Error("path_outside_root");

  const lexicalRelative = path.relative(root, absolutePath);
  const components = safeRelativeComponents(lexicalRelative);
  if (!components) throw new Error("path_traversal");

  let cursor = root;
  for (const component of components) {
    cursor = path.join(cursor, component);
    let stat;
    try {
      stat = await lstat(cursor);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const resolvedLink = await realpath(cursor).catch(() => {
        throw new Error("unresolved_symlink");
      });
      if (!isWithinRoot(root, resolvedLink)) throw new Error("symlink_outside_root");
      cursor = resolvedLink;
    }
  }

  const nearestResolved = await realpath(cursor).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return cursor;
    throw error;
  });
  if (!isWithinRoot(root, nearestResolved)) throw new Error("symlink_outside_root");
  return nearestResolved;
}

export async function toSafeRelativePath(options: {
  root: string;
  cwd: string;
  candidate: string;
}): Promise<string | undefined> {
  const { root, cwd, candidate } = options;
  if (candidate.length === 0 || candidate.length > 2048 || candidate.includes("\0")) {
    throw new Error("invalid_path");
  }
  if (candidate.split(/[\\/]/).some((part) => part === "..")) throw new Error("path_traversal");

  const absoluteCandidate = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(cwd, candidate);
  if (!isWithinRoot(root, absoluteCandidate)) throw new Error("path_outside_root");

  const safeTarget = await resolveExistingPathSafely(root, absoluteCandidate);
  const relative = path.relative(root, safeTarget).split(path.sep).join("/");
  if (relative === "" || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
    throw new Error("path_outside_root");
  }
  if (isSensitiveRelativePath(relative)) return undefined;
  return relative;
}

export async function resolveApprovedRoot(rootPath: string): Promise<string> {
  const root = await realpath(rootPath);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error("repository_root_not_directory");
  return root;
}

export async function assertPathWithinRoot(root: string, candidatePath: string): Promise<string> {
  const resolved = await realpath(candidatePath);
  if (!isWithinRoot(root, resolved)) throw new Error("path_outside_root");
  return resolved;
}
