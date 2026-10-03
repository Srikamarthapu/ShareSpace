import {
  codeCoverageSchema,
  eventKindSchema,
  preflightCandidateSchema,
  preflightRequestSchema,
  providerComparisonInputSchema,
  providerDecisionSchema,
  relationFindingSchema,
  resolutionAccessRequestSchema,
  resolutionSchema,
  taskStateSchema,
  type CodeCoverage,
  type PreflightRequest,
  type ProviderComparisonInput,
  type ProviderDecision,
  type RelationFinding,
  type Resolution,
  type ResolutionAccessRequest,
  type TaskActorRole,
  type TaskState,
} from "./contracts";

export interface CodeCoverageInput {
  checkedSourceIds: readonly string[];
  relevantEvidenceIds: readonly string[];
  coverageComplete: boolean;
  retrievalAvailable: boolean;
}

export function deriveCodeCoverage(input: CodeCoverageInput): CodeCoverage {
  if (!input.retrievalAvailable || input.checkedSourceIds.length === 0) return "unknown";
  if (input.relevantEvidenceIds.length > 0) return "present_evidence";
  return input.coverageComplete ? "no_evidence" : "partial_evidence";
}

export function classifyEvidenceFreshness(
  lastObservedAt: string | Date | null | undefined,
  now: Date,
  staleAfterMs: number,
): "current" | "stale" | "missing" {
  if (lastObservedAt === null || lastObservedAt === undefined) return "missing";
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    throw new RangeError("staleAfterMs must be a finite nonnegative number");
  }
  if (!Number.isFinite(now.getTime())) throw new RangeError("now must be a valid date");

  const observedTime = lastObservedAt instanceof Date ? lastObservedAt.getTime() : Date.parse(lastObservedAt);
  if (!Number.isFinite(observedTime)) return "stale";
  const ageMs = now.getTime() - observedTime;
  if (ageMs < 0) return "stale";
  return ageMs <= staleAfterMs ? "current" : "stale";
}

export interface RelationClassifier {
  classify(
    input: ProviderComparisonInput,
    options: { signal: AbortSignal },
  ): Promise<unknown>;
}

export type ProviderUnknownReason =
  | "provider_unavailable"
  | "timeout"
  | "provider_error"
  | "invalid_response";

export type RelationProviderOutcome =
  | { status: "available"; decision: ProviderDecision; elapsed_ms: number }
  | { status: "unknown"; reason: ProviderUnknownReason; elapsed_ms: number };

export interface ClassifyRelationsOptions {
  timeoutMs?: number;
}

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validProviderDecision(
  raw: unknown,
  input: ProviderComparisonInput,
): ProviderDecision | undefined {
  const parsed = providerDecisionSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const candidateIds = input.candidates.map(({ task_id }) => task_id);
  const expectedCandidateIds = new Set(candidateIds);
  const consideredIds = parsed.data.considered_candidate_ids;
  if (
    !uniqueStrings(candidateIds) ||
    !uniqueStrings(consideredIds) ||
    consideredIds.length !== expectedCandidateIds.size ||
    consideredIds.some((candidateId) => !expectedCandidateIds.has(candidateId))
  ) {
    return undefined;
  }

  const evidenceByCandidate = new Map(
    input.candidates.map(({ task_id, evidence_ids }) => [task_id, new Set(evidence_ids)]),
  );
  for (const finding of parsed.data.findings) {
    const allowedEvidence = evidenceByCandidate.get(finding.candidate_task_id);
    if (!allowedEvidence || finding.evidence_ids.some((evidenceId) => !allowedEvidence.has(evidenceId))) {
      return undefined;
    }
    if (finding.relation !== "unrelated" && finding.evidence_ids.length === 0) return undefined;
  }

  return parsed.data;
}

export async function classifyRelations(
  provider: RelationClassifier | null | undefined,
  input: ProviderComparisonInput,
  options: ClassifyRelationsOptions = {},
): Promise<RelationProviderOutcome> {
  const startedAt = Date.now();
  const normalizedInput = providerComparisonInputSchema.safeParse(input);
  if (!normalizedInput.success) {
    return { status: "unknown", reason: "invalid_response", elapsed_ms: Date.now() - startedAt };
  }
  if (!provider) {
    return { status: "unknown", reason: "provider_unavailable", elapsed_ms: Date.now() - startedAt };
  }

  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a finite positive number");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const providerCall = Promise.resolve()
    .then(() => provider.classify(normalizedInput.data, { signal: controller.signal }))
    .then(
      (value) => ({ kind: "response" as const, value }),
      () => ({ kind: "error" as const }),
    );
  const timedOut = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, timeoutMs);
  });

  const outcome = await Promise.race([providerCall, timedOut]);
  if (timer) clearTimeout(timer);
  const elapsedMs = Date.now() - startedAt;
  if (outcome.kind === "timeout") return { status: "unknown", reason: "timeout", elapsed_ms: elapsedMs };
  if (outcome.kind === "error") return { status: "unknown", reason: "provider_error", elapsed_ms: elapsedMs };

  const decision = validProviderDecision(outcome.value, normalizedInput.data);
  if (!decision) return { status: "unknown", reason: "invalid_response", elapsed_ms: elapsedMs };
  return { status: "available", decision, elapsed_ms: elapsedMs };
}

export interface PreflightStatusInput {
  providerOutcome: RelationProviderOutcome;
  codeCoverage: CodeCoverage;
  checkedSourceIds: readonly string[];
  codeCoverageComplete: boolean;
  candidateCoverageComplete: boolean;
  relationFindings: readonly Pick<RelationFinding, "relation">[];
}

export function derivePreflightStatus(input: PreflightStatusInput): "clear" | "review_suggested" | "unknown" {
  const hasDuplicate = input.relationFindings.some((finding) => finding.relation === "duplicate_outcome");
  if (input.providerOutcome.status === "available" && hasDuplicate) return "review_suggested";

  if (input.providerOutcome.status === "unknown") return "unknown";
  if (input.relationFindings.some((finding) => finding.relation === "uncertain")) return "unknown";
  if (!input.candidateCoverageComplete || !input.codeCoverageComplete) return "unknown";
  if (input.checkedSourceIds.length === 0 || input.codeCoverage === "unknown" || input.codeCoverage === "partial_evidence") {
    return "unknown";
  }
  return "clear";
}

export type ResolutionAccessResult =
  | { allowed: true }
  | { allowed: false; code: "wrong_session" | "consumed" | "expired" | "wrong_revision" };

export function checkResolutionAccess(
  resolution: Resolution,
  request: ResolutionAccessRequest,
): ResolutionAccessResult {
  if (request.session_id !== resolution.session_id) return { allowed: false, code: "wrong_session" };
  if (resolution.consumed_at !== null) return { allowed: false, code: "consumed" };
  if (Date.parse(resolution.expires_at) <= Date.parse(request.now)) return { allowed: false, code: "expired" };
  if (
    request.task_revision !== resolution.task_revision ||
    request.check_revision !== resolution.check_revision
  ) {
    return { allowed: false, code: "wrong_revision" };
  }
  return { allowed: true };
}

const allowedStateTransitions: Readonly<Record<TaskState, readonly TaskState[]>> = {
  proposed: ["checking", "paused", "canceled"],
  checking: ["active", "paused", "canceled"],
  active: ["awaiting_review", "paused", "canceled"],
  awaiting_review: ["active", "done", "paused", "canceled"],
  done: [],
  paused: ["active", "canceled"],
  canceled: [],
};

export type TaskTransitionResult =
  | { allowed: true; state: TaskState }
  | { allowed: false; code: "transition_not_allowed" | "actor_not_allowed" };

export function transitionTaskState(
  from: TaskState,
  to: TaskState,
  actor: TaskActorRole,
): TaskTransitionResult {
  const parsedFrom = taskStateSchema.safeParse(from);
  const parsedTo = taskStateSchema.safeParse(to);
  if (!parsedFrom.success || !parsedTo.success || !allowedStateTransitions[from]?.includes(to)) {
    return { allowed: false, code: "transition_not_allowed" };
  }

  if (to === "paused" || to === "canceled") {
    return actor === "owner"
      ? { allowed: true, state: to }
      : { allowed: false, code: "actor_not_allowed" };
  }
  if (from === "proposed" && to === "checking") {
    return actor === "system" ? { allowed: true, state: to } : { allowed: false, code: "actor_not_allowed" };
  }
  if (from === "checking" && to === "active") {
    return actor === "system" || actor === "builder"
      ? { allowed: true, state: to }
      : { allowed: false, code: "actor_not_allowed" };
  }
  if (from === "active" && to === "awaiting_review") {
    return actor === "agent" ? { allowed: true, state: to } : { allowed: false, code: "actor_not_allowed" };
  }
  if (from === "awaiting_review" && to === "done") {
    return actor === "builder" ? { allowed: true, state: to } : { allowed: false, code: "actor_not_allowed" };
  }
  if (from === "awaiting_review" && to === "active") {
    return actor === "builder" ? { allowed: true, state: to } : { allowed: false, code: "actor_not_allowed" };
  }
  if (from === "paused" && to === "active") {
    return actor === "owner" ? { allowed: true, state: to } : { allowed: false, code: "actor_not_allowed" };
  }
  return { allowed: false, code: "transition_not_allowed" };
}

export function makePreflightCandidate(value: unknown) {
  return preflightCandidateSchema.parse(value);
}

export function makeProviderComparisonInput(value: unknown): ProviderComparisonInput {
  return providerComparisonInputSchema.parse(value);
}

export function makePreflightRequest(value: unknown): PreflightRequest {
  return preflightRequestSchema.parse(value);
}

export function makeResolution(value: unknown): Resolution {
  return resolutionSchema.parse(value);
}

export function makeResolutionAccessRequest(value: unknown): ResolutionAccessRequest {
  return resolutionAccessRequestSchema.parse(value);
}

export function makeCodeCoverage(value: unknown): CodeCoverage {
  return codeCoverageSchema.parse(value);
}

export function makeRelationFinding(value: unknown): RelationFinding {
  return relationFindingSchema.parse(value);
}

export function parseEventKind(value: unknown) {
  return eventKindSchema.parse(value);
}
