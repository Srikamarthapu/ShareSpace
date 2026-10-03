import { z } from "zod";
import {
  EVENT_BATCH_MAX_BYTES,
  EVENT_BATCH_MAX_COUNT,
  EVENT_MAX_BYTES,
  eventKindSchema,
  isoTimestampSchema,
  safeRelativePathSchema,
  serializedByteLength,
  uuidSchema,
} from "./contracts.js";

/**
 * ShareSpace v1 shared contract. See docs/CONTRACT.md for the flows.
 *
 * - Browser reads use the signed-in user's Supabase client; RLS returns only rows from the
 *   user's current team. Row schemas use the database column names.
 * - Every mutation is a `POST /functions/v1/<name>` call with an `action` field. The browser
 *   sends its user JWT; the adapter sends its device token in DEVICE_TOKEN_HEADER. The function
 *   derives the actor from that credential. A user ID in a request body never grants access.
 */
export const CONTRACT_VERSION = 1;

export const EDGE_FUNCTIONS = {
  teams: "teams",
  devices: "devices",
  sharing: "sharing",
  ingest: "ingest",
  overlapCheck: "overlap-check",
} as const;

export const DEVICE_TOKEN_HEADER = "x-sharespace-device-token";

export const sharingStateSchema = z.object({ enabled: z.boolean(), paused: z.boolean() }).strict();

/** unknown is never treated as free capacity. */
export const storageStateSchema = z.enum(["ok", "warning", "cleanup", "paused", "unknown"]);

// ---------------------------------------------------------------------------
// Identity, teams and repositories

export const agentSchema = z.enum(["claude_code", "codex"]);
export type Agent = z.infer<typeof agentSchema>;
export const AGENT_LABELS: Record<Agent, string> = { claude_code: "Claude Code", codex: "Codex" };

export const memberRoleSchema = z.enum(["admin", "member"]);

/** GitHub-style `owner/name`. Compared case-insensitively. */
export const repositoryNameSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Expected owner/name");

/** Turns a git remote URL into `owner/name` (lowercase), or null if it has no owner/name path. */
export function normalizeRepositoryRemote(remote: string): string | null {
  const trimmed = remote
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  // scp-style `git@host:owner/name`, or a URL with a scheme.
  const path =
    /^[^/@:]+@[^/:]+:(.+)$/.exec(trimmed)?.[1] ?? /^[a-z+]+:\/\/[^/]+\/(.+)$/i.exec(trimmed)?.[1];
  if (!path) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const name = segments.join("/").toLowerCase();
  return repositoryNameSchema.safeParse(name).success ? name : null;
}

export const teamRowSchema = z
  .object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(80),
    created_at: isoTimestampSchema,
  })
  .strict();

export const repositoryRowSchema = z
  .object({
    id: uuidSchema,
    team_id: uuidSchema,
    name: repositoryNameSchema,
    created_at: isoTimestampSchema,
  })
  .strict();

export const memberRowSchema = z
  .object({
    team_id: uuidSchema,
    user_id: uuidSchema,
    role: memberRoleSchema,
    display_name: z.string().min(1).max(100),
    avatar_url: z.url().max(2_000).nullable(),
    joined_at: isoTimestampSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Tokens. Hex keeps them URL-safe and easy to spot for redaction.

export const inviteTokenSchema = z.string().regex(/^ssi-[0-9a-f]{64}$/);
export const deviceTokenSchema = z.string().regex(/^ssd-[0-9a-f]{64}$/);
export const pollSecretSchema = z.string().regex(/^ssp-[0-9a-f]{64}$/);
/** Short code the user compares between terminal and browser. No 0/O/1/I. */
export const userCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
export const SHARESPACE_TOKEN_PATTERN = /\bss[idp]-[0-9a-f]{64}\b/g;

// ---------------------------------------------------------------------------
// `teams` function (browser). One team per user in v1.

export const inviteStateSchema = z.enum(["valid", "rotated", "invalid"]);

export const teamsRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create_team"),
      team_name: teamRowSchema.shape.name,
      repository_name: repositoryNameSchema,
    })
    .strict(),
  /** Admin only. Returns the current link; null until the first rotate. */
  z.object({ action: z.literal("get_invite"), team_id: uuidSchema }).strict(),
  /** Admin only. Makes a new link; the old one stops working. Members stay. */
  z.object({ action: z.literal("rotate_invite"), team_id: uuidSchema }).strict(),
  z.object({ action: z.literal("preview_invite"), token: inviteTokenSchema }).strict(),
  /** Joining a team you already belong to returns your membership again. */
  z.object({ action: z.literal("accept_invite"), token: inviteTokenSchema }).strict(),
  /** Admin only. Also revokes the member's devices. The last admin cannot be removed. */
  z
    .object({ action: z.literal("remove_member"), team_id: uuidSchema, user_id: uuidSchema })
    .strict(),
]);

const inviteViewSchema = z
  .object({
    invite_token: inviteTokenSchema.nullable(),
    invite_revision: z.number().int().nonnegative(),
  })
  .strict();

export const teamsResponseSchemas = {
  create_team: z.object({ team: teamRowSchema, repository: repositoryRowSchema }).strict(),
  get_invite: inviteViewSchema,
  rotate_invite: inviteViewSchema,
  preview_invite: z
    .object({ state: inviteStateSchema, team_name: teamRowSchema.shape.name.nullable() })
    .strict(),
  accept_invite: z.object({ team_id: uuidSchema, role: memberRoleSchema }).strict(),
  remove_member: z.object({ removed_user_id: uuidSchema }).strict(),
} as const;

// ---------------------------------------------------------------------------
// `devices` function: pairing (device-code style) and revocation.

export const capabilityStateSchema = z.enum(["supported", "partial", "unsupported"]);
export const capabilitiesSchema = z
  .object({
    event_capture: capabilityStateSchema,
    overlap_check: capabilityStateSchema,
    warning_delivery: capabilityStateSchema,
  })
  .strict();

export const pairingStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);
export const deviceStatusSchema = z.enum(["approved", "revoked"]);

const agentVersionSchema = z.string().min(1).max(50);
const deviceNameSchema = z.string().trim().min(1).max(100);

/** Team members can read devices in their team. The token hash is never in this table. */
export const deviceRowSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    team_id: uuidSchema,
    repository_id: uuidSchema,
    name: deviceNameSchema,
    agent: agentSchema,
    agent_version: agentVersionSchema.nullable(),
    capabilities: capabilitiesSchema,
    status: deviceStatusSchema,
    created_at: isoTimestampSchema,
    last_used_at: isoTimestampSchema.nullable(),
    revoked_at: isoTimestampSchema.nullable(),
  })
  .strict();

/** What the browser shows on the approval screen. */
export const pairingViewSchema = z
  .object({
    id: uuidSchema,
    user_code: userCodeSchema,
    agent: agentSchema,
    agent_version: agentVersionSchema.nullable(),
    device_name: deviceNameSchema,
    repository_name: repositoryNameSchema,
    /** The matching repository in the viewer's team, or null if the team has no such repository. */
    repository_id: uuidSchema.nullable(),
    capabilities: capabilitiesSchema,
    status: pairingStatusSchema,
    expires_at: isoTimestampSchema,
  })
  .strict();

export const devicesRequestSchema = z.discriminatedUnion("action", [
  /** Adapter, no credential. */
  z
    .object({
      action: z.literal("start_pairing"),
      agent: agentSchema,
      agent_version: agentVersionSchema.nullable(),
      device_name: deviceNameSchema,
      repository_name: repositoryNameSchema,
      capabilities: capabilitiesSchema,
    })
    .strict(),
  /** Adapter, no credential. The approved token is returned once; later polls return expired. */
  z
    .object({
      action: z.literal("poll_pairing"),
      pairing_id: uuidSchema,
      poll_secret: pollSecretSchema,
    })
    .strict(),
  /** Browser. */
  z.object({ action: z.literal("get_pairing"), user_code: userCodeSchema }).strict(),
  /** Browser. Needs a pending request whose repository is in the user's team. */
  z.object({ action: z.literal("approve_pairing"), user_code: userCodeSchema }).strict(),
  z.object({ action: z.literal("reject_pairing"), user_code: userCodeSchema }).strict(),
  /** Browser. Only the device owner can revoke it. */
  z.object({ action: z.literal("revoke_device"), device_id: uuidSchema }).strict(),
  /** Adapter, device token. Lets the adapter check its access before it captures. */
  z.object({ action: z.literal("device_status") }).strict(),
]);

export const devicesResponseSchemas = {
  start_pairing: z
    .object({
      pairing_id: uuidSchema,
      user_code: userCodeSchema,
      /** Web page the user opens to approve, with the code filled in. */
      approve_url: z.url(),
      poll_secret: pollSecretSchema,
      poll_interval_ms: z.number().int().min(1_000).max(30_000),
      expires_at: isoTimestampSchema,
    })
    .strict(),
  poll_pairing: z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending") }).strict(),
    z
      .object({
        status: z.literal("approved"),
        device_id: uuidSchema,
        device_token: deviceTokenSchema,
        team_id: uuidSchema,
        repository_id: uuidSchema,
      })
      .strict(),
    z.object({ status: z.literal("rejected") }).strict(),
    z.object({ status: z.literal("expired") }).strict(),
  ]),
  get_pairing: pairingViewSchema,
  approve_pairing: z.object({ device: deviceRowSchema }).strict(),
  reject_pairing: z.object({ status: z.literal("rejected") }).strict(),
  revoke_device: z.object({ device: deviceRowSchema }).strict(),
  device_status: z
    .object({
      device_id: uuidSchema,
      repository_id: uuidSchema,
      sharing: sharingStateSchema,
      storage_state: storageStateSchema,
    })
    .strict(),
} as const;

// ---------------------------------------------------------------------------
// `sharing` function: opt-in, pause, private sessions and deletion.
// Changes affect future capture only. Already shared history stays until the owner deletes it.

/** One row per user per repository. No row means sharing is off. */
export const sharingSettingRowSchema = z
  .object({
    user_id: uuidSchema,
    repository_id: uuidSchema,
    enabled: z.boolean(),
    paused: z.boolean(),
    updated_at: isoTimestampSchema,
  })
  .strict();

export const sessionVisibilitySchema = z.enum(["shared", "private"]);

export const sharingRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("set_sharing"),
      repository_id: uuidSchema,
      enabled: z.boolean().optional(),
      paused: z.boolean().optional(),
    })
    .strict()
    .refine((value) => value.enabled !== undefined || value.paused !== undefined, {
      message: "Set enabled, paused, or both",
    }),
  /** Owner only. A private session accepts no new events. */
  z
    .object({
      action: z.literal("set_session_visibility"),
      session_id: uuidSchema,
      visibility: sessionVisibilitySchema,
    })
    .strict(),
  /** Owner only. Deletes events and related warning excerpts; the session row stays as a tombstone. */
  z.object({ action: z.literal("delete_session"), session_id: uuidSchema }).strict(),
]);

// ---------------------------------------------------------------------------
// Sessions and events (browser reads through RLS)

export const historyRemovedReasonSchema = z.enum(["owner_deleted", "pruned"]);

export const sessionRowSchema = z
  .object({
    id: uuidSchema,
    team_id: uuidSchema,
    repository_id: uuidSchema,
    user_id: uuidSchema,
    device_id: uuidSchema,
    agent: agentSchema,
    agent_version: agentVersionSchema.nullable(),
    branch: z.string().max(255).nullable(),
    /** First line of the first prompt, set by the server. */
    title: z.string().max(120).nullable(),
    latest_prompt: z.string().max(500).nullable(),
    /** Most recent safe relative paths seen in tool events. */
    touched_paths: z.array(safeRelativePathSchema).max(50),
    visibility: sessionVisibilitySchema,
    /** Things this agent/version cannot capture, shown to readers. */
    capture_limitations: z.array(z.string().min(1).max(200)).max(20),
    started_at: isoTimestampSchema,
    last_activity_at: isoTimestampSchema,
    ended_at: isoTimestampSchema.nullable(),
    event_count: z.number().int().nonnegative(),
    history_removed_at: isoTimestampSchema.nullable(),
    history_removed_reason: historyRemovedReasonSchema.nullable(),
  })
  .strict()
  .refine((row) => (row.history_removed_at === null) === (row.history_removed_reason === null), {
    message: "history_removed_at and history_removed_reason must both be set or both be null",
  });

export const MAX_TEXT_CHARS = 4_000;
export const MAX_EXCERPT_CHARS = 500;
const textSchema = z.string().max(MAX_TEXT_CHARS);
const relativePathsSchema = z.array(safeRelativePathSchema).max(50);
const toolNameSchema = z.string().min(1).max(100);
const toolCallIdSchema = z.string().min(1).max(128);

export const eventPayloadSchemas = {
  "session.started": z
    .object({
      branch: z.string().max(255).nullable(),
      agent_version: agentVersionSchema.nullable(),
      capture_limitations: z.array(z.string().min(1).max(200)).max(20),
    })
    .strict(),
  "session.ended": z.object({ reason: z.string().max(100).nullable() }).strict(),
  "user.message": z.object({ text: textSchema, branch: z.string().max(255).nullable() }).strict(),
  "assistant.message": z.object({ text: textSchema }).strict(),
  "tool.started": z
    .object({
      tool_call_id: toolCallIdSchema,
      tool_name: toolNameSchema,
      input_excerpt: textSchema.nullable(),
      relative_paths: relativePathsSchema,
    })
    .strict(),
  "tool.completed": z
    .object({
      tool_call_id: toolCallIdSchema.nullable(),
      tool_name: toolNameSchema,
      status: z.enum(["success", "error"]),
      output_excerpt: textSchema.nullable(),
      relative_paths: relativePathsSchema,
      duration_ms: z.number().int().nonnegative().nullable(),
    })
    .strict(),
} as const;

type EventKind = z.infer<typeof eventKindSchema>;

export const eventRoleSchema = z.enum(["user", "assistant", "tool", "system"]);
export type EventRole = z.infer<typeof eventRoleSchema>;

export function eventRole(kind: EventKind): EventRole {
  if (kind === "user.message") return "user";
  if (kind === "assistant.message") return "assistant";
  if (kind === "tool.started" || kind === "tool.completed") return "tool";
  return "system";
}

/** Shown in the transcript. `tool.started` without a matching `tool.completed` means running. */
export const toolStatusSchema = z.enum(["success", "error", "running"]);

const eventCommonShape = {
  session_id: uuidSchema,
  /** Adapter-assigned order inside a session. Display order is (sequence, occurred_at, id). */
  sequence: z.number().int().nonnegative(),
  occurred_at: isoTimestampSchema,
  /** The adapter removed secrets from this event. */
  redacted: z.boolean(),
  /** The adapter shortened some text in this event. */
  truncated: z.boolean(),
};

function eventVariant<K extends EventKind, Extra extends z.ZodRawShape>(kind: K, extra: Extra) {
  return z
    .object({
      ...eventCommonShape,
      ...extra,
      kind: z.literal(kind),
      payload: eventPayloadSchemas[kind],
    })
    .strict();
}

function eventUnion<Extra extends z.ZodRawShape>(extra: Extra) {
  return z.discriminatedUnion("kind", [
    eventVariant("session.started", extra),
    eventVariant("session.ended", extra),
    eventVariant("user.message", extra),
    eventVariant("assistant.message", extra),
    eventVariant("tool.started", extra),
    eventVariant("tool.completed", extra),
  ]);
}

function withinBytes<T extends z.ZodType>(schema: T, maxBytes: number, label: string): T {
  return schema.superRefine((value, ctx) => {
    if (serializedByteLength(value) > maxBytes) {
      ctx.addIssue({ code: "custom", message: `${label} exceeds ${maxBytes} bytes` });
    }
  });
}

/** One event as the adapter sends it. event_id is stable, so a retry is a duplicate, not a new event. */
export const ingestEventSchema = withinBytes(
  eventUnion({ event_id: uuidSchema }),
  EVENT_MAX_BYTES,
  "Event",
);

/** One event as the browser reads it from `session_events`. */
export const eventRowSchema = eventUnion({
  id: uuidSchema,
  team_id: uuidSchema,
  /** Server insert order. Use it as the catch-up cursor after a Realtime gap. */
  ingest_id: z.number().int().positive(),
  received_at: isoTimestampSchema,
});

export type IngestEvent = z.infer<typeof ingestEventSchema>;
export type EventRow = z.infer<typeof eventRowSchema>;

export const EVENT_PAGE_SIZE_DEFAULT = 50;
export const EVENT_PAGE_SIZE_MAX = 100;

/** Tables the browser subscribes to. After any (re)subscribe, read rows past the last cursor. */
export const REALTIME_TABLES = [
  "sessions",
  "session_events",
  "overlap_checks",
  "cleanup_notices",
] as const;

// ---------------------------------------------------------------------------
// `ingest` function (adapter, device token)

export const ingestRequestSchema = withinBytes(
  z.object({ events: z.array(ingestEventSchema).min(1).max(EVENT_BATCH_MAX_COUNT) }).strict(),
  EVENT_BATCH_MAX_BYTES,
  "Batch",
);

/** Why one event in an accepted batch was not stored. Drop the event; do not retry it. */
export const eventRejectCodeSchema = z.enum([
  "session_private",
  "history_removed",
  "session_conflict",
  "invalid_event",
]);

export const ingestResponseSchema = z
  .object({
    results: z
      .array(
        z.discriminatedUnion("outcome", [
          z.object({ event_id: uuidSchema, outcome: z.literal("accepted") }).strict(),
          z.object({ event_id: uuidSchema, outcome: z.literal("duplicate") }).strict(),
          z
            .object({
              event_id: uuidSchema,
              outcome: z.literal("rejected"),
              code: eventRejectCodeSchema,
            })
            .strict(),
        ]),
      )
      .max(EVENT_BATCH_MAX_COUNT),
    sharing: sharingStateSchema,
    storage_state: storageStateSchema,
  })
  .strict();

/** Bounds for the adapter's local retry queue. Oldest events go first when it is full. */
export const ADAPTER_QUEUE_MAX_EVENTS = 1_000;
export const ADAPTER_QUEUE_MAX_BYTES = 2_000_000;

// ---------------------------------------------------------------------------
// `overlap-check` function (adapter, device token)

/** Starting value. Measure real latency before changing the hook timeout. */
export const OVERLAP_CHECK_TIMEOUT_MS = 10_000;
export const OVERLAP_UNAVAILABLE_MESSAGE = "Overlap check unavailable — continuing.";
/** Raw Jev value from 0 to 1. Its calibration is unverified: do not show it as a percentage or as accuracy. */
export const OVERLAP_SCORE_LABEL = "Model score";

export const overlapCheckRequestSchema = z
  .object({
    session_id: uuidSchema,
    /** The `user.message` event for this prompt. Retrying with the same ID returns the same check. */
    event_id: uuidSchema,
    prompt_text: textSchema.min(1),
    branch: z.string().max(255).nullable(),
  })
  .strict();

export const overlapOutcomeSchema = z.enum(["warning", "no_overlap", "unavailable"]);
export const overlapRelationSchema = z.enum(["overlapping", "related"]);
export const overlapUnavailableReasonSchema = z.enum([
  "timeout",
  "provider_error",
  "invalid_response",
  "provider_unconfigured",
  "context_unavailable",
]);

export const overlapFindingSchema = z
  .object({
    related_session_id: uuidSchema,
    related_user_id: uuidSchema,
    relation: overlapRelationSchema,
    score: z.number().min(0).max(1).nullable(),
    summary: z.string().min(1).max(MAX_EXCERPT_CHARS),
    /** Excerpts are removed when the source session's history is removed. */
    evidence: z
      .array(
        z
          .object({
            session_id: uuidSchema,
            event_id: uuidSchema,
            excerpt: z.string().max(MAX_EXCERPT_CHARS).nullable(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

/** Team-visible. Only implementation requests produce a stored check. */
export const overlapCheckRowSchema = z
  .object({
    id: uuidSchema,
    team_id: uuidSchema,
    repository_id: uuidSchema,
    session_id: uuidSchema,
    user_id: uuidSchema,
    trigger_event_id: uuidSchema,
    outcome: overlapOutcomeSchema,
    request_excerpt: z.string().max(MAX_EXCERPT_CHARS).nullable(),
    findings: z.array(overlapFindingSchema).max(5),
    unavailable_reason: overlapUnavailableReasonSchema.nullable(),
    created_at: isoTimestampSchema,
  })
  .strict()
  .superRefine((row, ctx) => {
    const overlapping = row.findings.some((finding) => finding.relation === "overlapping");
    if (row.outcome === "warning" && !overlapping) {
      ctx.addIssue({
        code: "custom",
        path: ["findings"],
        message: "A warning needs an overlapping finding",
      });
    }
    if (row.outcome === "no_overlap" && overlapping) {
      ctx.addIssue({
        code: "custom",
        path: ["findings"],
        message: "no_overlap cannot have an overlapping finding",
      });
    }
    if (
      row.outcome === "unavailable" &&
      (row.findings.length > 0 || row.unavailable_reason === null)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "unavailable needs a reason and no findings",
      });
    }
    if (row.outcome !== "unavailable" && row.unavailable_reason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["unavailable_reason"],
        message: "Only unavailable has a reason",
      });
    }
  });

export const overlapCheckResponseSchema = z
  .object({
    /** not_applicable: the prompt is not an implementation request; nothing is stored. */
    outcome: z.enum([...overlapOutcomeSchema.options, "not_applicable"]),
    check_id: uuidSchema.nullable(),
    /** Text the adapter gives the coding agent, or null. */
    agent_context: z.string().max(2_000).nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Storage and cleanup (decimal MB, PRD FR-07)

export const STORAGE_LIMITS = {
  person_limit_bytes: 50_000_000,
  person_warn_bytes: 40_000_000,
  person_target_bytes: 30_000_000,
  database_warn_bytes: 350_000_000,
  database_pause_bytes: 400_000_000,
} as const;

/** Returned by the `storage_status()` database function for the signed-in user. */
export const storageStatusSchema = z
  .object({
    person: z
      .object({
        accounted_bytes: z.number().int().nonnegative(),
        limit_bytes: z.number().int().positive(),
        state: storageStateSchema,
      })
      .strict(),
    database: z
      .object({
        database_bytes: z.number().int().nonnegative().nullable(),
        measured_at: isoTimestampSchema.nullable(),
        state: storageStateSchema,
      })
      .strict(),
  })
  .strict();

/** Visible to the user whose history was removed. */
export const cleanupNoticeRowSchema = z
  .object({
    id: uuidSchema,
    team_id: uuidSchema,
    user_id: uuidSchema,
    reason: z.enum(["quota", "database_capacity", "owner_deleted"]),
    removed_session_ids: z.array(uuidSchema).max(100),
    freed_bytes: z.number().int().nonnegative(),
    created_at: isoTimestampSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Errors (every function returns this shape on a non-2xx status)

export const apiErrorCodeSchema = z.enum([
  "invalid_request", // 400
  "unauthenticated", // 401: no or bad user session
  "device_unknown", // 401: bad device token
  "device_revoked", // 401
  "forbidden", // 403: signed in, but not allowed (for example, not an admin)
  "not_member", // 403: not in this team any more
  "not_found", // 404
  "already_in_team", // 409
  "last_admin", // 409
  "invite_rotated", // 409
  "pairing_expired", // 409
  "repository_mismatch", // 409: pairing repository is not in the user's team
  "sharing_disabled", // 409
  "sharing_paused", // 409
  "payload_too_large", // 413
  "rate_limited", // 429
  "storage_paused", // 507
  "unavailable", // 503
  "internal", // 500
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string().max(500),
        retry_after_ms: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

/**
 * What the adapter does with its queue after a failed upload.
 * - retry: keep the batch and try again later.
 * - drop_batch: this batch can never succeed; drop it and keep going.
 * - drop_queue: stop uploading and clear the queue. Never flush it after access or sharing returns.
 */
export function ingestFailureAction(code: ApiErrorCode): "retry" | "drop_batch" | "drop_queue" {
  switch (code) {
    case "rate_limited":
    case "unavailable":
    case "internal":
      return "retry";
    case "invalid_request":
    case "payload_too_large":
      return "drop_batch";
    default:
      return "drop_queue";
  }
}

export type TeamsRequest = z.infer<typeof teamsRequestSchema>;
export type DevicesRequest = z.infer<typeof devicesRequestSchema>;
export type SharingRequest = z.infer<typeof sharingRequestSchema>;
export type TeamRow = z.infer<typeof teamRowSchema>;
export type RepositoryRow = z.infer<typeof repositoryRowSchema>;
export type MemberRow = z.infer<typeof memberRowSchema>;
export type DeviceRow = z.infer<typeof deviceRowSchema>;
export type PairingView = z.infer<typeof pairingViewSchema>;
export type SharingSettingRow = z.infer<typeof sharingSettingRowSchema>;
export type SessionRow = z.infer<typeof sessionRowSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type IngestResponse = z.infer<typeof ingestResponseSchema>;
export type OverlapCheckRequest = z.infer<typeof overlapCheckRequestSchema>;
export type OverlapCheckRow = z.infer<typeof overlapCheckRowSchema>;
export type OverlapCheckResponse = z.infer<typeof overlapCheckResponseSchema>;
export type StorageStatus = z.infer<typeof storageStatusSchema>;
export type CleanupNoticeRow = z.infer<typeof cleanupNoticeRowSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
