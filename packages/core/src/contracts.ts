import { z } from "zod";

export const uuidSchema = z.uuid();
export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const safeRelativePathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((path) => {
    if (
      path.startsWith("/") ||
      path.startsWith("~") ||
      path.includes("\\") ||
      /^[A-Za-z]:/.test(path) ||
      /[\u0000-\u001f\u007f]/.test(path)
    ) {
      return false;
    }

    const segments = path.split("/");
    return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
  }, "Expected a safe, relative POSIX path");

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

function checkRelativePaths(value: JsonValue, path: (string | number)[], ctx: z.RefinementCtx): void {
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
              message: "Expected a safe, relative POSIX path",
            });
          }
        });
      }
    }
    checkRelativePaths(child, [...path, key], ctx);
  }
}

export const eventPayloadSchema = z.record(z.string(), jsonValueSchema).superRefine((payload, ctx) => {
  checkRelativePaths(payload, [], ctx);
});

export const EVENT_MAX_BYTES = 16 * 1_024;
export const EVENT_BATCH_MAX_COUNT = 50;
export const EVENT_BATCH_MAX_BYTES = 512 * 1_024;

export const eventKindSchema = z.enum([
  "user.message",
  "assistant.message",
  "tool.started",
  "tool.completed",
  "session.started",
  "session.ended",
]);

export function serializedByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? Number.POSITIVE_INFINITY : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export const eventEnvelopeSchema = z
  .object({
    schema_version: z.literal(1),
    event_id: uuidSchema,
    session_id: uuidSchema,
    source_sequence: z.number().int().nonnegative(),
    kind: eventKindSchema,
    occurred_at: isoTimestampSchema,
    payload: eventPayloadSchema,
  })
  .strict()
  .superRefine((event, ctx) => {
    if (serializedByteLength(event) > EVENT_MAX_BYTES) {
      ctx.addIssue({ code: "custom", path: ["payload"], message: `Event exceeds ${EVENT_MAX_BYTES} bytes` });
    }
  });

export const eventBatchSchema = z
  .object({
    events: z.array(eventEnvelopeSchema).min(1).max(EVENT_BATCH_MAX_COUNT),
  })
  .strict()
  .superRefine((batch, ctx) => {
    if (serializedByteLength(batch) > EVENT_BATCH_MAX_BYTES) {
      ctx.addIssue({ code: "custom", path: ["events"], message: `Batch exceeds ${EVENT_BATCH_MAX_BYTES} bytes` });
    }
  });

export const requestKindSchema = z.enum(["implementation", "conversation", "continuation", "unclear"]);

export const preflightRequestSchema = z
  .object({
    request_id: uuidSchema,
    project_id: uuidSchema,
    session_id: uuidSchema,
    task_id: uuidSchema.optional(),
    task_revision: z.number().int().positive().default(1),
    active_set_revision: z.number().int().nonnegative(),
    request_kind: requestKindSchema,
    request_text: z.string().min(1).max(12_000),
    intent: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        outcome: z.string().trim().min(1).max(1_000).optional(),
        scope: z.string().trim().min(1).max(2_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const codeCoverageSchema = z.enum([
  "present_evidence",
  "partial_evidence",
  "no_evidence",
  "unknown",
]);

export const relationSchema = z.enum([
  "duplicate_outcome",
  "related_dependency",
  "complementary",
  "unrelated",
  "uncertain",
]);

export const evidenceFreshnessSchema = z.enum(["current", "stale", "missing"]);

export const implementationFindingSchema = z
  .object({
    evidence_id: uuidSchema,
    source_snapshot_id: uuidSchema,
    relative_path: safeRelativePathSchema,
    source_version: z.string().max(200).optional(),
    excerpt: z.string().max(500).optional(),
  })
  .strict();

export const relationFindingSchema = z
  .object({
    candidate_task_id: uuidSchema,
    relation: relationSchema,
    evidence_ids: z.array(uuidSchema).max(100),
    freshness: evidenceFreshnessSchema,
  })
  .strict()
  .superRefine((finding, ctx) => {
    if (finding.relation !== "unrelated" && finding.relation !== "uncertain" && finding.evidence_ids.length === 0) {
      ctx.addIssue({ code: "custom", path: ["evidence_ids"], message: "Actionable relation findings require evidence IDs" });
    }
  });

export const preflightStatusSchema = z.enum(["clear", "review_suggested", "unknown"]);
export const allowedActionSchema = z.enum(["coordinate", "revise", "proceed", "retry", "continue"]);

export const preflightResultSchema = z
  .object({
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
    allowed_actions: z.array(allowedActionSchema).max(5),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.status === "clear" && (result.checked_source_ids.length === 0 || result.evidence_ids.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "A clear result requires source coverage and evidence IDs",
      });
    }
    if (result.status === "clear" && (result.code_coverage === "unknown" || result.code_coverage === "partial_evidence")) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Unknown or partial code coverage cannot produce a clear result",
      });
    }
    if (
      result.status === "clear" &&
      result.relation_findings.some((finding) => finding.relation === "duplicate_outcome" || finding.relation === "uncertain")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Duplicate or uncertain relation findings cannot produce a clear result",
      });
    }

    const allowedEvidenceIds = new Set(result.evidence_ids);
    for (const [index, finding] of result.implementation_findings.entries()) {
      if (!allowedEvidenceIds.has(finding.evidence_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["implementation_findings", index, "evidence_id"],
          message: "Implementation finding must cite a listed evidence ID",
        });
      }
    }
    for (const [index, finding] of result.relation_findings.entries()) {
      for (const [evidenceIndex, evidenceId] of finding.evidence_ids.entries()) {
        if (!allowedEvidenceIds.has(evidenceId)) {
          ctx.addIssue({
            code: "custom",
            path: ["relation_findings", index, "evidence_ids", evidenceIndex],
            message: "Relation finding must cite a listed evidence ID",
          });
        }
      }
    }
  });

export const taskStateSchema = z.enum([
  "proposed",
  "checking",
  "active",
  "awaiting_review",
  "done",
  "paused",
  "canceled",
]);

export const taskActorRoleSchema = z.enum(["agent", "builder", "owner", "system"]);

export const taskTransitionSchema = z
  .object({
    from: taskStateSchema,
    to: taskStateSchema,
  })
  .strict()
  .refine(({ from, to }) => from !== to, "Task state must change");

export const resolutionSchema = z
  .object({
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
    accepted_scope: z.string().max(2_000).optional(),
  })
  .strict();

export const resolutionAccessRequestSchema = z
  .object({
    session_id: uuidSchema,
    task_revision: z.number().int().positive(),
    check_revision: z.number().int().positive(),
    now: isoTimestampSchema,
  })
  .strict();

export const preflightCandidateSchema = z
  .object({
    task_id: uuidSchema,
    title: z.string().min(1).max(200),
    outcome: z.string().max(1_000),
    owner_id: uuidSchema.optional(),
    evidence_ids: z.array(uuidSchema).max(100),
  })
  .strict();

export const providerComparisonInputSchema = z
  .object({
    request: preflightRequestSchema,
    candidates: z.array(preflightCandidateSchema).max(50),
  })
  .strict()
  .superRefine(({ request, candidates }, ctx) => {
    const candidateIds = candidates.map(({ task_id }) => task_id);
    if (!uniqueUuidList(candidateIds)) {
      ctx.addIssue({ code: "custom", path: ["candidates"], message: "Candidate task IDs must be unique" });
    }
    if (request.task_id && candidateIds.includes(request.task_id)) {
      ctx.addIssue({ code: "custom", path: ["candidates"], message: "The current task cannot be its own candidate" });
    }
  });

export const providerFindingSchema = z
  .object({
    candidate_task_id: uuidSchema,
    relation: relationSchema,
    evidence_ids: z.array(uuidSchema).max(100),
  })
  .strict();

export const providerDecisionSchema = z
  .object({
    considered_candidate_ids: z.array(uuidSchema).max(50),
    findings: z.array(providerFindingSchema).max(100),
  })
  .strict();

function uniqueUuidList(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type EventBatch = z.infer<typeof eventBatchSchema>;
export type PreflightRequest = z.infer<typeof preflightRequestSchema>;
export type PreflightResult = z.infer<typeof preflightResultSchema>;
export type CodeCoverage = z.infer<typeof codeCoverageSchema>;
export type Relation = z.infer<typeof relationSchema>;
export type RelationFinding = z.infer<typeof relationFindingSchema>;
export type TaskState = z.infer<typeof taskStateSchema>;
export type TaskActorRole = z.infer<typeof taskActorRoleSchema>;
export type Resolution = z.infer<typeof resolutionSchema>;
export type ResolutionAccessRequest = z.infer<typeof resolutionAccessRequestSchema>;
export type ProviderComparisonInput = z.infer<typeof providerComparisonInputSchema>;
export type ProviderDecision = z.infer<typeof providerDecisionSchema>;
