/* eslint-disable */
// Generated from packages/core/src/v1.ts. Do not edit; run build-contracts.mjs.

// packages/core/src/v1.ts
import { z as z2 } from "zod";

// packages/core/src/contracts.ts
import { z } from "zod";
var uuidSchema = z.uuid();
var isoTimestampSchema = z.iso.datetime({ offset: true });
var safeRelativePathSchema = z.string().min(1).max(1024).refine((path) => {
  if (path.startsWith("/") || path.startsWith("~") || path.includes("\\") || /^[A-Za-z]:/.test(path) || /[\u0000-\u001f\u007f]/.test(path)) {
    return false;
  }
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}, "Expected a safe, relative POSIX path");
var jsonValueSchema = z.lazy(
  () => z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);
function checkRelativePaths(value, path, ctx) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkRelativePaths(entry, [...path, index], ctx));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "relative_paths") {
      if (!Array.isArray(child)) {
        ctx.addIssue({ code: "custom", path: [...path, key], message: "relative_paths must be an array" });
      } else {
        child.forEach((entry, index) => {
          const result = safeRelativePathSchema.safeParse(entry);
          if (!result.success) {
            ctx.addIssue({
              code: "custom",
              path: [...path, key, index],
              message: "Expected a safe, relative POSIX path"
            });
          }
        });
      }
    }
    checkRelativePaths(child, [...path, key], ctx);
  }
}
var eventPayloadSchema = z.record(z.string(), jsonValueSchema).superRefine((payload, ctx) => {
  checkRelativePaths(payload, [], ctx);
});
var EVENT_MAX_BYTES = 16 * 1024;
var EVENT_BATCH_MAX_COUNT = 50;
var EVENT_BATCH_MAX_BYTES = 512 * 1024;
var eventKindSchema = z.enum([
  "user.message",
  "assistant.message",
  "tool.started",
  "tool.completed",
  "session.started",
  "session.ended"
]);
function serializedByteLength(value) {
  try {
    const serialized = JSON.stringify(value);
    return serialized === void 0 ? Number.POSITIVE_INFINITY : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
var eventEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  event_id: uuidSchema,
  session_id: uuidSchema,
  source_sequence: z.number().int().nonnegative(),
  kind: eventKindSchema,
  occurred_at: isoTimestampSchema,
  payload: eventPayloadSchema
}).strict().superRefine((event, ctx) => {
  if (serializedByteLength(event) > EVENT_MAX_BYTES) {
    ctx.addIssue({ code: "custom", path: ["payload"], message: `Event exceeds ${EVENT_MAX_BYTES} bytes` });
  }
});
var eventBatchSchema = z.object({
  events: z.array(eventEnvelopeSchema).min(1).max(EVENT_BATCH_MAX_COUNT)
}).strict().superRefine((batch, ctx) => {
  if (serializedByteLength(batch) > EVENT_BATCH_MAX_BYTES) {
    ctx.addIssue({ code: "custom", path: ["events"], message: `Batch exceeds ${EVENT_BATCH_MAX_BYTES} bytes` });
  }
});
var requestKindSchema = z.enum(["implementation", "conversation", "continuation", "unclear"]);
var preflightRequestSchema = z.object({
  request_id: uuidSchema,
  project_id: uuidSchema,
  session_id: uuidSchema,
  task_id: uuidSchema.optional(),
  task_revision: z.number().int().positive().default(1),
  active_set_revision: z.number().int().nonnegative(),
  request_kind: requestKindSchema,
  request_text: z.string().min(1).max(12e3),
  intent: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    outcome: z.string().trim().min(1).max(1e3).optional(),
    scope: z.string().trim().min(1).max(2e3).optional()
  }).strict().optional()
}).strict();
var codeCoverageSchema = z.enum([
  "present_evidence",
  "partial_evidence",
  "no_evidence",
  "unknown"
]);
var relationSchema = z.enum([
  "duplicate_outcome",
  "related_dependency",
  "complementary",
  "unrelated",
  "uncertain"
]);
var evidenceFreshnessSchema = z.enum(["current", "stale", "missing"]);
var implementationFindingSchema = z.object({
  evidence_id: uuidSchema,
  source_snapshot_id: uuidSchema,
  relative_path: safeRelativePathSchema,
  source_version: z.string().max(200).optional(),
  excerpt: z.string().max(500).optional()
}).strict();
var relationFindingSchema = z.object({
  candidate_task_id: uuidSchema,
  relation: relationSchema,
  evidence_ids: z.array(uuidSchema).max(100),
  freshness: evidenceFreshnessSchema
}).strict().superRefine((finding, ctx) => {
  if (finding.relation !== "unrelated" && finding.relation !== "uncertain" && finding.evidence_ids.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence_ids"], message: "Actionable relation findings require evidence IDs" });
  }
});
var preflightStatusSchema = z.enum(["clear", "review_suggested", "unknown"]);
var allowedActionSchema = z.enum(["coordinate", "revise", "proceed", "retry", "continue"]);
var preflightResultSchema = z.object({
  check_id: uuidSchema,
  task_id: uuidSchema,
  task_revision: z.number().int().positive(),
  active_set_revision: z.number().int().nonnegative(),
  status: preflightStatusSchema,
  code_coverage: codeCoverageSchema,
  checked_source_ids: z.array(uuidSchema).max(500),
  evidence_ids: z.array(uuidSchema).max(500),
  implementation_findings: z.array(implementationFindingSchema).max(100),
  relation_findings: z.array(relationFindingSchema).max(100),
  limitations: z.array(z.string().min(1).max(500)).max(50),
  allowed_actions: z.array(allowedActionSchema).max(5)
}).strict().superRefine((result, ctx) => {
  if (result.status === "clear" && (result.checked_source_ids.length === 0 || result.evidence_ids.length === 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "A clear result requires source coverage and evidence IDs"
    });
  }
  if (result.status === "clear" && (result.code_coverage === "unknown" || result.code_coverage === "partial_evidence")) {
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "Unknown or partial code coverage cannot produce a clear result"
    });
  }
  if (result.status === "clear" && result.relation_findings.some((finding) => finding.relation === "duplicate_outcome" || finding.relation === "uncertain")) {
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "Duplicate or uncertain relation findings cannot produce a clear result"
    });
  }
  const allowedEvidenceIds = new Set(result.evidence_ids);
  for (const [index, finding] of result.implementation_findings.entries()) {
    if (!allowedEvidenceIds.has(finding.evidence_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["implementation_findings", index, "evidence_id"],
        message: "Implementation finding must cite a listed evidence ID"
      });
    }
  }
  for (const [index, finding] of result.relation_findings.entries()) {
    for (const [evidenceIndex, evidenceId] of finding.evidence_ids.entries()) {
      if (!allowedEvidenceIds.has(evidenceId)) {
        ctx.addIssue({
          code: "custom",
          path: ["relation_findings", index, "evidence_ids", evidenceIndex],
          message: "Relation finding must cite a listed evidence ID"
        });
      }
    }
  }
});
var taskStateSchema = z.enum([
  "proposed",
  "checking",
  "active",
  "awaiting_review",
  "done",
  "paused",
  "canceled"
]);
var taskActorRoleSchema = z.enum(["agent", "builder", "owner", "system"]);
var taskTransitionSchema = z.object({
  from: taskStateSchema,
  to: taskStateSchema
}).strict().refine(({ from, to }) => from !== to, "Task state must change");
var resolutionSchema = z.object({
  resolution_id: uuidSchema,
  check_id: uuidSchema,
  project_id: uuidSchema,
  task_id: uuidSchema,
  task_revision: z.number().int().positive(),
  check_revision: z.number().int().positive(),
  session_id: uuidSchema,
  action: z.enum(["coordinate", "revise", "proceed"]),
  expires_at: isoTimestampSchema,
  consumed_at: isoTimestampSchema.nullable(),
  accepted_scope: z.string().max(2e3).optional()
}).strict();
var resolutionAccessRequestSchema = z.object({
  session_id: uuidSchema,
  task_revision: z.number().int().positive(),
  check_revision: z.number().int().positive(),
  now: isoTimestampSchema
}).strict();
var preflightCandidateSchema = z.object({
  task_id: uuidSchema,
  title: z.string().min(1).max(200),
  outcome: z.string().max(1e3),
  owner_id: uuidSchema.optional(),
  evidence_ids: z.array(uuidSchema).max(100)
}).strict();
var providerComparisonInputSchema = z.object({
  request: preflightRequestSchema,
  candidates: z.array(preflightCandidateSchema).max(50)
}).strict().superRefine(({ request, candidates }, ctx) => {
  const candidateIds = candidates.map(({ task_id }) => task_id);
  if (!uniqueUuidList(candidateIds)) {
    ctx.addIssue({ code: "custom", path: ["candidates"], message: "Candidate task IDs must be unique" });
  }
  if (request.task_id && candidateIds.includes(request.task_id)) {
    ctx.addIssue({ code: "custom", path: ["candidates"], message: "The current task cannot be its own candidate" });
  }
});
var providerFindingSchema = z.object({
  candidate_task_id: uuidSchema,
  relation: relationSchema,
  evidence_ids: z.array(uuidSchema).max(100)
}).strict();
var providerDecisionSchema = z.object({
  considered_candidate_ids: z.array(uuidSchema).max(50),
  findings: z.array(providerFindingSchema).max(100)
}).strict();
function uniqueUuidList(values) {
  return new Set(values).size === values.length;
}

// packages/core/src/v1.ts
var CONTRACT_VERSION = 1;
var EDGE_FUNCTIONS = {
  teams: "teams",
  devices: "devices",
  sharing: "sharing",
  ingest: "ingest",
  overlapCheck: "overlap-check"
};
var DEVICE_TOKEN_HEADER = "x-sharespace-device-token";
var sharingStateSchema = z2.object({ enabled: z2.boolean(), paused: z2.boolean() }).strict();
var storageStateSchema = z2.enum(["ok", "warning", "cleanup", "paused", "unknown"]);
var agentSchema = z2.enum(["claude_code", "codex"]);
var AGENT_LABELS = { claude_code: "Claude Code", codex: "Codex" };
var memberRoleSchema = z2.enum(["admin", "member"]);
var repositoryNameSchema = z2.string().max(200).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Expected owner/name");
function normalizeRepositoryRemote(remote) {
  const trimmed = remote.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const path = /^[^/@:]+@[^/:]+:(.+)$/.exec(trimmed)?.[1] ?? /^[a-z+]+:\/\/[^/]+\/(.+)$/i.exec(trimmed)?.[1];
  if (!path) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const name = segments.join("/").toLowerCase();
  return repositoryNameSchema.safeParse(name).success ? name : null;
}
var teamRowSchema = z2.object({
  id: uuidSchema,
  name: z2.string().trim().min(2).max(80),
  created_at: isoTimestampSchema
}).strict();
var repositoryRowSchema = z2.object({
  id: uuidSchema,
  team_id: uuidSchema,
  name: repositoryNameSchema,
  created_at: isoTimestampSchema
}).strict();
var memberRowSchema = z2.object({
  team_id: uuidSchema,
  user_id: uuidSchema,
  role: memberRoleSchema,
  display_name: z2.string().min(1).max(100),
  avatar_url: z2.url().max(2e3).nullable(),
  joined_at: isoTimestampSchema
}).strict();
var inviteTokenSchema = z2.string().regex(/^ssi-[0-9a-f]{64}$/);
var deviceTokenSchema = z2.string().regex(/^ssd-[0-9a-f]{64}$/);
var pollSecretSchema = z2.string().regex(/^ssp-[0-9a-f]{64}$/);
var userCodeSchema = z2.string().regex(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
var SHARESPACE_TOKEN_PATTERN = /\bss[idp]-[0-9a-f]{64}\b/g;
var inviteStateSchema = z2.enum(["valid", "rotated", "invalid"]);
var teamsRequestSchema = z2.discriminatedUnion("action", [
  z2.object({
    action: z2.literal("create_team"),
    team_name: teamRowSchema.shape.name,
    repository_name: repositoryNameSchema
  }).strict(),
  /** Admin only. Free teams have one repository; an active Pro plan allows five. */
  z2.object({ action: z2.literal("add_repository"), team_id: uuidSchema, repository_name: repositoryNameSchema }).strict(),
  /** Admin only. Returns the current link; null until the first rotate. */
  z2.object({ action: z2.literal("get_invite"), team_id: uuidSchema }).strict(),
  /** Admin only. Makes a new link; the old one stops working. Members stay. */
  z2.object({ action: z2.literal("rotate_invite"), team_id: uuidSchema }).strict(),
  z2.object({ action: z2.literal("preview_invite"), token: inviteTokenSchema }).strict(),
  /** Joining a team you already belong to returns your membership again. */
  z2.object({ action: z2.literal("accept_invite"), token: inviteTokenSchema }).strict(),
  /** Admin only. Also revokes the member's devices. The last admin cannot be removed. */
  z2.object({ action: z2.literal("remove_member"), team_id: uuidSchema, user_id: uuidSchema }).strict()
]);
var inviteViewSchema = z2.object({
  invite_token: inviteTokenSchema.nullable(),
  invite_revision: z2.number().int().nonnegative()
}).strict();
var teamsResponseSchemas = {
  create_team: z2.object({ team: teamRowSchema, repository: repositoryRowSchema }).strict(),
  add_repository: z2.object({ repository: repositoryRowSchema }).strict(),
  get_invite: inviteViewSchema,
  rotate_invite: inviteViewSchema,
  preview_invite: z2.object({ state: inviteStateSchema, team_name: teamRowSchema.shape.name.nullable() }).strict(),
  accept_invite: z2.object({ team_id: uuidSchema, role: memberRoleSchema }).strict(),
  remove_member: z2.object({ removed_user_id: uuidSchema }).strict()
};
var capabilityStateSchema = z2.enum(["supported", "partial", "unsupported"]);
var capabilitiesSchema = z2.object({
  event_capture: capabilityStateSchema,
  overlap_check: capabilityStateSchema,
  warning_delivery: capabilityStateSchema
}).strict();
var pairingStatusSchema = z2.enum(["pending", "approved", "rejected", "expired"]);
var deviceStatusSchema = z2.enum(["approved", "revoked"]);
var agentVersionSchema = z2.string().min(1).max(50);
var deviceNameSchema = z2.string().trim().min(1).max(100);
var deviceRowSchema = z2.object({
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
  revoked_at: isoTimestampSchema.nullable()
}).strict();
var pairingViewSchema = z2.object({
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
  expires_at: isoTimestampSchema
}).strict();
var devicesRequestSchema = z2.discriminatedUnion("action", [
  /** Adapter, no credential. */
  z2.object({
    action: z2.literal("start_pairing"),
    agent: agentSchema,
    agent_version: agentVersionSchema.nullable(),
    device_name: deviceNameSchema,
    repository_name: repositoryNameSchema,
    capabilities: capabilitiesSchema
  }).strict(),
  /** Adapter, no credential. The approved token is returned once; later polls return expired. */
  z2.object({
    action: z2.literal("poll_pairing"),
    pairing_id: uuidSchema,
    poll_secret: pollSecretSchema
  }).strict(),
  /** Browser. */
  z2.object({ action: z2.literal("get_pairing"), user_code: userCodeSchema }).strict(),
  /** Browser. Needs a pending request whose repository is in the user's team. */
  z2.object({ action: z2.literal("approve_pairing"), user_code: userCodeSchema }).strict(),
  z2.object({ action: z2.literal("reject_pairing"), user_code: userCodeSchema }).strict(),
  /** Browser. Only the device owner can revoke it. */
  z2.object({ action: z2.literal("revoke_device"), device_id: uuidSchema }).strict(),
  /** Adapter, device token. Lets the adapter check its access before it captures. */
  z2.object({ action: z2.literal("device_status") }).strict()
]);
var devicesResponseSchemas = {
  start_pairing: z2.object({
    pairing_id: uuidSchema,
    user_code: userCodeSchema,
    /** Web page the user opens to approve, with the code filled in. */
    approve_url: z2.url(),
    poll_secret: pollSecretSchema,
    poll_interval_ms: z2.number().int().min(1e3).max(3e4),
    expires_at: isoTimestampSchema
  }).strict(),
  poll_pairing: z2.discriminatedUnion("status", [
    z2.object({ status: z2.literal("pending") }).strict(),
    z2.object({
      status: z2.literal("approved"),
      device_id: uuidSchema,
      device_token: deviceTokenSchema,
      team_id: uuidSchema,
      repository_id: uuidSchema
    }).strict(),
    z2.object({ status: z2.literal("rejected") }).strict(),
    z2.object({ status: z2.literal("expired") }).strict()
  ]),
  get_pairing: pairingViewSchema,
  approve_pairing: z2.object({ device: deviceRowSchema }).strict(),
  reject_pairing: z2.object({ status: z2.literal("rejected") }).strict(),
  revoke_device: z2.object({ device: deviceRowSchema }).strict(),
  device_status: z2.object({
    device_id: uuidSchema,
    repository_id: uuidSchema,
    sharing: sharingStateSchema,
    storage_state: storageStateSchema
  }).strict()
};
var sharingSettingRowSchema = z2.object({
  user_id: uuidSchema,
  repository_id: uuidSchema,
  team_id: uuidSchema,
  enabled: z2.boolean(),
  paused: z2.boolean(),
  updated_at: isoTimestampSchema
}).strict();
var sessionVisibilitySchema = z2.enum(["shared", "private"]);
var sharingRequestSchema = z2.discriminatedUnion("action", [
  z2.object({
    action: z2.literal("set_sharing"),
    repository_id: uuidSchema,
    enabled: z2.boolean().optional(),
    paused: z2.boolean().optional()
  }).strict().refine((value) => value.enabled !== void 0 || value.paused !== void 0, {
    message: "Set enabled, paused, or both"
  }),
  /** Owner only. A private session accepts no new events. */
  z2.object({
    action: z2.literal("set_session_visibility"),
    session_id: uuidSchema,
    visibility: sessionVisibilitySchema
  }).strict(),
  /** Owner only. Deletes events and related warning excerpts; the session row stays as a tombstone. */
  z2.object({ action: z2.literal("delete_session"), session_id: uuidSchema }).strict()
]);
var historyRemovedReasonSchema = z2.enum(["owner_deleted", "pruned"]);
var sessionRowSchema = z2.object({
  id: uuidSchema,
  team_id: uuidSchema,
  repository_id: uuidSchema,
  user_id: uuidSchema,
  device_id: uuidSchema,
  agent: agentSchema,
  agent_version: agentVersionSchema.nullable(),
  branch: z2.string().max(255).nullable(),
  /** First line of the first prompt, set by the server. */
  title: z2.string().max(120).nullable(),
  latest_prompt: z2.string().max(500).nullable(),
  /** Most recent safe relative paths seen in tool events. */
  touched_paths: z2.array(safeRelativePathSchema).max(50),
  visibility: sessionVisibilitySchema,
  /** Things this agent/version cannot capture, shown to readers. */
  capture_limitations: z2.array(z2.string().min(1).max(200)).max(20),
  started_at: isoTimestampSchema,
  last_activity_at: isoTimestampSchema,
  ended_at: isoTimestampSchema.nullable(),
  event_count: z2.number().int().nonnegative(),
  history_removed_at: isoTimestampSchema.nullable(),
  history_removed_reason: historyRemovedReasonSchema.nullable()
}).strict().refine((row) => row.history_removed_at === null === (row.history_removed_reason === null), {
  message: "history_removed_at and history_removed_reason must both be set or both be null"
});
var MAX_TEXT_CHARS = 4e3;
var MAX_EXCERPT_CHARS = 500;
var textSchema = z2.string().max(MAX_TEXT_CHARS);
var relativePathsSchema = z2.array(safeRelativePathSchema).max(50);
var toolNameSchema = z2.string().min(1).max(100);
var toolCallIdSchema = z2.string().min(1).max(128);
var eventPayloadSchemas = {
  "session.started": z2.object({
    branch: z2.string().max(255).nullable(),
    agent_version: agentVersionSchema.nullable(),
    capture_limitations: z2.array(z2.string().min(1).max(200)).max(20)
  }).strict(),
  "session.ended": z2.object({ reason: z2.string().max(100).nullable() }).strict(),
  "user.message": z2.object({ text: textSchema, branch: z2.string().max(255).nullable() }).strict(),
  "assistant.message": z2.object({ text: textSchema }).strict(),
  "tool.started": z2.object({
    tool_call_id: toolCallIdSchema,
    tool_name: toolNameSchema,
    input_excerpt: textSchema.nullable(),
    relative_paths: relativePathsSchema
  }).strict(),
  "tool.completed": z2.object({
    tool_call_id: toolCallIdSchema.nullable(),
    tool_name: toolNameSchema,
    status: z2.enum(["success", "error"]),
    output_excerpt: textSchema.nullable(),
    relative_paths: relativePathsSchema,
    duration_ms: z2.number().int().nonnegative().nullable()
  }).strict()
};
var eventRoleSchema = z2.enum(["user", "assistant", "tool", "system"]);
function eventRole(kind) {
  if (kind === "user.message") return "user";
  if (kind === "assistant.message") return "assistant";
  if (kind === "tool.started" || kind === "tool.completed") return "tool";
  return "system";
}
var toolStatusSchema = z2.enum(["success", "error", "running"]);
var eventCommonShape = {
  session_id: uuidSchema,
  /** Adapter-assigned order inside a session. Display order is (sequence, occurred_at, id). */
  sequence: z2.number().int().nonnegative(),
  occurred_at: isoTimestampSchema,
  /** The adapter removed secrets from this event. */
  redacted: z2.boolean(),
  /** The adapter shortened some text in this event. */
  truncated: z2.boolean()
};
function eventVariant(kind, extra) {
  return z2.object({
    ...eventCommonShape,
    ...extra,
    kind: z2.literal(kind),
    payload: eventPayloadSchemas[kind]
  }).strict();
}
function eventUnion(extra) {
  return z2.discriminatedUnion("kind", [
    eventVariant("session.started", extra),
    eventVariant("session.ended", extra),
    eventVariant("user.message", extra),
    eventVariant("assistant.message", extra),
    eventVariant("tool.started", extra),
    eventVariant("tool.completed", extra)
  ]);
}
function withinBytes(schema, maxBytes, label) {
  return schema.superRefine((value, ctx) => {
    if (serializedByteLength(value) > maxBytes) {
      ctx.addIssue({ code: "custom", message: `${label} exceeds ${maxBytes} bytes` });
    }
  });
}
var ingestEventSchema = withinBytes(
  eventUnion({ event_id: uuidSchema }),
  EVENT_MAX_BYTES,
  "Event"
);
var eventRowSchema = eventUnion({
  id: uuidSchema,
  team_id: uuidSchema,
  /** Allocation order, not commit order. Exclusive cursor reads alone can miss late commits. */
  ingest_id: z2.number().int().positive(),
  received_at: isoTimestampSchema
});
var EVENT_PAGE_SIZE_DEFAULT = 50;
var EVENT_PAGE_SIZE_MAX = 100;
var REALTIME_TABLES = [
  "sessions",
  "session_events",
  "overlap_checks",
  "cleanup_notices"
];
var ingestRequestSchema = withinBytes(
  z2.object({ events: z2.array(ingestEventSchema).min(1).max(EVENT_BATCH_MAX_COUNT) }).strict(),
  EVENT_BATCH_MAX_BYTES,
  "Batch"
);
var eventRejectCodeSchema = z2.enum([
  "session_private",
  "history_removed",
  "session_conflict",
  "invalid_event"
]);
var ingestResponseSchema = z2.object({
  results: z2.array(
    z2.discriminatedUnion("outcome", [
      z2.object({ event_id: uuidSchema, outcome: z2.literal("accepted") }).strict(),
      z2.object({ event_id: uuidSchema, outcome: z2.literal("duplicate") }).strict(),
      z2.object({
        event_id: uuidSchema,
        outcome: z2.literal("rejected"),
        code: eventRejectCodeSchema
      }).strict()
    ])
  ).max(EVENT_BATCH_MAX_COUNT),
  sharing: sharingStateSchema,
  storage_state: storageStateSchema
}).strict();
var ADAPTER_QUEUE_MAX_EVENTS = 1e3;
var ADAPTER_QUEUE_MAX_BYTES = 2e6;
var OVERLAP_CHECK_TIMEOUT_MS = 1e4;
var OVERLAP_UNAVAILABLE_MESSAGE = "Overlap check unavailable \u2014 continuing.";
var OVERLAP_SCORE_LABEL = "Model score";
var overlapCheckRequestSchema = z2.object({
  session_id: uuidSchema,
  /** The `user.message` event for this prompt. Retrying with the same ID returns the same check. */
  event_id: uuidSchema,
  prompt_text: textSchema.min(1),
  branch: z2.string().max(255).nullable()
}).strict();
var overlapOutcomeSchema = z2.enum(["warning", "no_overlap", "unavailable"]);
var overlapRelationSchema = z2.enum(["overlapping", "related"]);
var overlapUnavailableReasonSchema = z2.enum([
  "timeout",
  "provider_error",
  "invalid_response",
  "provider_unconfigured",
  "context_unavailable"
]);
var overlapFindingSchema = z2.object({
  related_session_id: uuidSchema,
  related_user_id: uuidSchema,
  relation: overlapRelationSchema,
  score: z2.number().min(0).max(1).nullable(),
  summary: z2.string().min(1).max(MAX_EXCERPT_CHARS),
  /** Excerpts are removed when the source session's history is removed. */
  evidence: z2.array(
    z2.object({
      session_id: uuidSchema,
      event_id: uuidSchema,
      excerpt: z2.string().max(MAX_EXCERPT_CHARS).nullable()
    }).strict()
  ).max(5)
}).strict();
var overlapCheckRowSchema = z2.object({
  id: uuidSchema,
  team_id: uuidSchema,
  repository_id: uuidSchema,
  session_id: uuidSchema,
  user_id: uuidSchema,
  trigger_event_id: uuidSchema,
  outcome: overlapOutcomeSchema,
  request_excerpt: z2.string().max(MAX_EXCERPT_CHARS).nullable(),
  findings: z2.array(overlapFindingSchema).max(5),
  unavailable_reason: overlapUnavailableReasonSchema.nullable(),
  created_at: isoTimestampSchema
}).strict().superRefine((row, ctx) => {
  const overlapping = row.findings.some((finding) => finding.relation === "overlapping");
  if (row.outcome === "warning" && !overlapping) {
    ctx.addIssue({
      code: "custom",
      path: ["findings"],
      message: "A warning needs an overlapping finding"
    });
  }
  if (row.outcome === "no_overlap" && overlapping) {
    ctx.addIssue({
      code: "custom",
      path: ["findings"],
      message: "no_overlap cannot have an overlapping finding"
    });
  }
  if (row.outcome === "unavailable" && (row.findings.length > 0 || row.unavailable_reason === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["outcome"],
      message: "unavailable needs a reason and no findings"
    });
  }
  if (row.outcome !== "unavailable" && row.unavailable_reason !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["unavailable_reason"],
      message: "Only unavailable has a reason"
    });
  }
});
var overlapCheckResponseSchema = z2.object({
  /** not_applicable: the prompt is not an implementation request; nothing is stored. */
  outcome: z2.enum([...overlapOutcomeSchema.options, "not_applicable"]),
  check_id: uuidSchema.nullable(),
  /** Text the adapter gives the coding agent, or null. */
  agent_context: z2.string().max(2e3).nullable()
}).strict();
var STORAGE_LIMITS = {
  person_limit_bytes: 5e7,
  person_warn_bytes: 4e7,
  person_target_bytes: 3e7,
  database_warn_bytes: 35e7,
  database_pause_bytes: 4e8
};
var storageStatusSchema = z2.object({
  person: z2.object({
    accounted_bytes: z2.number().int().nonnegative(),
    limit_bytes: z2.number().int().positive(),
    state: storageStateSchema
  }).strict(),
  database: z2.object({
    database_bytes: z2.number().int().nonnegative().nullable(),
    measured_at: isoTimestampSchema.nullable(),
    state: storageStateSchema
  }).strict()
}).strict();
var cleanupNoticeRowSchema = z2.object({
  id: uuidSchema,
  team_id: uuidSchema,
  user_id: uuidSchema,
  reason: z2.enum(["quota", "database_capacity", "owner_deleted"]),
  removed_session_ids: z2.array(uuidSchema).max(100),
  freed_bytes: z2.number().int().nonnegative(),
  created_at: isoTimestampSchema
}).strict();
var apiErrorCodeSchema = z2.enum([
  "invalid_request",
  // 400
  "unauthenticated",
  // 401: no or bad user session
  "device_unknown",
  // 401: bad device token
  "device_revoked",
  // 401
  "forbidden",
  // 403: signed in, but not allowed (for example, not an admin)
  "not_member",
  // 403: not in this team any more
  "not_found",
  // 404
  "already_in_team",
  // 409
  "last_admin",
  // 409
  "invite_rotated",
  // 409
  "pairing_expired",
  // 409
  "repository_mismatch",
  // 409: pairing repository is not in the user's team
  "sharing_disabled",
  // 409
  "sharing_paused",
  // 409
  "payload_too_large",
  // 413
  "rate_limited",
  // 429
  "storage_paused",
  // 507
  "unavailable",
  // 503
  "internal"
  // 500
]);
var apiErrorSchema = z2.object({
  error: z2.object({
    code: apiErrorCodeSchema,
    message: z2.string().max(500),
    retry_after_ms: z2.number().int().positive().optional()
  }).strict()
}).strict();
function ingestFailureAction(code) {
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
export {
  ADAPTER_QUEUE_MAX_BYTES,
  ADAPTER_QUEUE_MAX_EVENTS,
  AGENT_LABELS,
  CONTRACT_VERSION,
  DEVICE_TOKEN_HEADER,
  EDGE_FUNCTIONS,
  EVENT_PAGE_SIZE_DEFAULT,
  EVENT_PAGE_SIZE_MAX,
  MAX_EXCERPT_CHARS,
  MAX_TEXT_CHARS,
  OVERLAP_CHECK_TIMEOUT_MS,
  OVERLAP_SCORE_LABEL,
  OVERLAP_UNAVAILABLE_MESSAGE,
  REALTIME_TABLES,
  SHARESPACE_TOKEN_PATTERN,
  STORAGE_LIMITS,
  agentSchema,
  apiErrorCodeSchema,
  apiErrorSchema,
  capabilitiesSchema,
  capabilityStateSchema,
  cleanupNoticeRowSchema,
  deviceRowSchema,
  deviceStatusSchema,
  deviceTokenSchema,
  devicesRequestSchema,
  devicesResponseSchemas,
  eventPayloadSchemas,
  eventRejectCodeSchema,
  eventRole,
  eventRoleSchema,
  eventRowSchema,
  historyRemovedReasonSchema,
  ingestEventSchema,
  ingestFailureAction,
  ingestRequestSchema,
  ingestResponseSchema,
  inviteStateSchema,
  inviteTokenSchema,
  memberRoleSchema,
  memberRowSchema,
  normalizeRepositoryRemote,
  overlapCheckRequestSchema,
  overlapCheckResponseSchema,
  overlapCheckRowSchema,
  overlapFindingSchema,
  overlapOutcomeSchema,
  overlapRelationSchema,
  overlapUnavailableReasonSchema,
  pairingStatusSchema,
  pairingViewSchema,
  pollSecretSchema,
  repositoryNameSchema,
  repositoryRowSchema,
  sessionRowSchema,
  sessionVisibilitySchema,
  sharingRequestSchema,
  sharingSettingRowSchema,
  sharingStateSchema,
  storageStateSchema,
  storageStatusSchema,
  teamRowSchema,
  teamsRequestSchema,
  teamsResponseSchemas,
  toolStatusSchema,
  userCodeSchema
};
