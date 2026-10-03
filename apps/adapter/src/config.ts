import { readFile } from "node:fs/promises";
import path from "node:path";
import { isRecord } from "./privacy.js";

export interface SharingCategories {
  user_prompts: boolean;
  tool_metadata: boolean;
  tool_excerpts: boolean;
}

export interface AdapterConfig {
  schema_version: 1;
  repository_root: string;
  consent: {
    enabled: boolean;
    version: 1;
    consented_at: string | null;
    categories: SharingCategories;
  };
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).every((key) => expected.includes(key));
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function parseAdapterConfig(value: unknown): AdapterConfig {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schema_version", "repository_root", "consent"])) {
    throw new Error("invalid_config_shape");
  }
  if (
    value.schema_version !== 1 ||
    typeof value.repository_root !== "string" ||
    !path.isAbsolute(value.repository_root)
  ) {
    throw new Error("invalid_config_header");
  }

  const consent = value.consent;
  if (
    !isRecord(consent) ||
    !hasOnlyKeys(consent, ["enabled", "version", "consented_at", "categories"]) ||
    typeof consent.enabled !== "boolean" ||
    consent.version !== 1
  ) {
    throw new Error("invalid_config_consent");
  }
  if (consent.enabled && !isIsoTimestamp(consent.consented_at))
    throw new Error("consent_timestamp_required");
  if (!consent.enabled && consent.consented_at !== null && !isIsoTimestamp(consent.consented_at)) {
    throw new Error("invalid_config_timestamp");
  }

  const categories = consent.categories;
  if (
    !isRecord(categories) ||
    !hasOnlyKeys(categories, ["user_prompts", "tool_metadata", "tool_excerpts"]) ||
    typeof categories.user_prompts !== "boolean" ||
    typeof categories.tool_metadata !== "boolean" ||
    typeof categories.tool_excerpts !== "boolean"
  ) {
    throw new Error("invalid_config_categories");
  }
  if (categories.tool_excerpts && !categories.tool_metadata)
    throw new Error("tool_excerpts_require_metadata_consent");

  return {
    schema_version: 1,
    repository_root: value.repository_root,
    consent: {
      enabled: consent.enabled,
      version: 1,
      consented_at: consent.consented_at as string | null,
      categories: {
        user_prompts: categories.user_prompts,
        tool_metadata: categories.tool_metadata,
        tool_excerpts: categories.tool_excerpts,
      },
    },
  };
}

export async function readAdapterConfig(configPath: string): Promise<AdapterConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    throw new Error("Could not read the adapter configuration file.");
  }
  if (Buffer.byteLength(raw, "utf8") > 16 * 1024)
    throw new Error("Adapter configuration exceeds the 16 KiB limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Adapter configuration must contain valid JSON.");
  }
  try {
    return parseAdapterConfig(parsed);
  } catch {
    throw new Error(
      "Adapter configuration is invalid; check its schema and explicit consent settings.",
    );
  }
}

export function resolveConfigPath(argument: string | undefined): string | undefined {
  if (!argument) return undefined;
  return path.resolve(argument);
}
