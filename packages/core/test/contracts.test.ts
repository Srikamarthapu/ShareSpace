import { describe, expect, it } from "vitest";
import {
  EVENT_BATCH_MAX_COUNT,
  EVENT_MAX_BYTES,
  classifyEvidenceFreshness,
  classifyRelations,
  checkResolutionAccess,
  deriveCodeCoverage,
  derivePreflightStatus,
  eventBatchSchema,
  eventEnvelopeSchema,
  preflightRequestSchema,
  preflightResultSchema,
  resolutionAccessRequestSchema,
  resolutionSchema,
  transitionTaskState,
  type ProviderComparisonInput,
} from "../src/index.js";

const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

function makeEvent(eventId = 1, payload: Record<string, unknown> = { text: "hello" }) {
  return {
    schema_version: 1,
    event_id: uuid(eventId),
    session_id: uuid(900),
    source_sequence: 0,
    kind: "tool.completed",
    occurred_at: "2026-10-03T18:00:00Z",
    payload,
  };
}

function makeRequest() {
  return preflightRequestSchema.parse({
    request_id: uuid(1),
    project_id: uuid(2),
    session_id: uuid(3),
    task_id: uuid(4),
    active_set_revision: 18,
    request_kind: "implementation",
    request_text: "Add bookmark support to the API",
    intent: { title: "Bookmark API", outcome: "Save and remove bookmarks" },
  });
}

function makeProviderInput(): ProviderComparisonInput {
  return {
    request: makeRequest(),
    candidates: [
      {
        task_id: uuid(5),
        title: "Implement bookmarks",
        outcome: "Users can save bookmarks",
        evidence_ids: [uuid(6)],
      },
    ],
  };
}

function validResolution() {
  return resolutionSchema.parse({
    resolution_id: uuid(1),
    check_id: uuid(2),
    project_id: uuid(3),
    task_id: uuid(4),
    task_revision: 2,
    check_revision: 7,
    session_id: uuid(5),
    action: "proceed",
    expires_at: "2026-10-03T19:00:00Z",
    consumed_at: null,
  });
}

const accessRequest = (overrides: Record<string, unknown> = {}) =>
  resolutionAccessRequestSchema.parse({
    session_id: uuid(5),
    task_revision: 2,
    check_revision: 7,
    now: "2026-10-03T18:30:00Z",
    ...overrides,
  });

describe("event ingestion contracts", () => {
  it("accepts the snake-case UUID event contract and nonnegative source sequences", () => {
    expect(eventEnvelopeSchema.safeParse(makeEvent()).success).toBe(true);
  });

  it("rejects invalid UUIDs and unsafe relative paths", () => {
    expect(eventEnvelopeSchema.safeParse({ ...makeEvent(), event_id: "evt_demo_014" }).success).toBe(false);
    expect(eventEnvelopeSchema.safeParse(makeEvent(1, { relative_paths: ["../private.txt"] })).success).toBe(false);
    expect(eventEnvelopeSchema.safeParse(makeEvent(1, { nested: { relative_paths: ["/etc/passwd"] } })).success).toBe(false);
  });

  it("enforces per-event, batch-count, and serialized batch caps", () => {
    const oversizedEvent = makeEvent(1, { text: "x".repeat(EVENT_MAX_BYTES) });
    expect(eventEnvelopeSchema.safeParse(oversizedEvent).success).toBe(false);

    const tooMany = Array.from({ length: EVENT_BATCH_MAX_COUNT + 1 }, (_, index) => makeEvent(index + 1));
    expect(eventBatchSchema.safeParse({ events: tooMany }).success).toBe(false);

    const individuallyBounded = Array.from({ length: EVENT_BATCH_MAX_COUNT }, (_, index) =>
      makeEvent(index + 1, { text: "x".repeat(11_000) }),
    );
    expect(individuallyBounded.every((event) => eventEnvelopeSchema.safeParse(event).success)).toBe(true);
    expect(eventBatchSchema.safeParse({ events: individuallyBounded }).success).toBe(false);
  });
});

describe("preflight coverage and policy", () => {
  it("keeps code coverage independent from relationship findings", () => {
    expect(
      deriveCodeCoverage({
        checkedSourceIds: [uuid(20)],
        relevantEvidenceIds: [],
        coverageComplete: false,
        retrievalAvailable: true,
      }),
    ).toBe("partial_evidence");
    expect(
      deriveCodeCoverage({
        checkedSourceIds: [uuid(20)],
        relevantEvidenceIds: [],
        coverageComplete: true,
        retrievalAvailable: true,
      }),
    ).toBe("no_evidence");

    const status = derivePreflightStatus({
      providerOutcome: {
        status: "available",
        decision: { considered_candidate_ids: [uuid(5)], findings: [] },
        elapsed_ms: 4,
      },
      codeCoverage: "present_evidence",
      checkedSourceIds: [uuid(20)],
      codeCoverageComplete: true,
      candidateCoverageComplete: true,
      relationFindings: [{ relation: "complementary" }],
    });
    expect(status).toBe("clear");
  });

  it("does not return clear without evidence coverage", () => {
    const providerOutcome = {
      status: "available" as const,
      decision: { considered_candidate_ids: [uuid(5)], findings: [] },
      elapsed_ms: 2,
    };
    expect(
      derivePreflightStatus({
        providerOutcome,
        codeCoverage: "unknown",
        checkedSourceIds: [],
        codeCoverageComplete: false,
        candidateCoverageComplete: true,
        relationFindings: [],
      }),
    ).toBe("unknown");

    const ungroundedClear = preflightResultSchema.safeParse({
      check_id: uuid(1),
      task_id: uuid(2),
      task_revision: 1,
      active_set_revision: 0,
      status: "clear",
      code_coverage: "no_evidence",
      checked_source_ids: [],
      evidence_ids: [],
      implementation_findings: [],
      relation_findings: [],
      limitations: [],
      allowed_actions: ["proceed"],
    });
    expect(ungroundedClear.success).toBe(false);

    expect(
      preflightResultSchema.safeParse({
        check_id: uuid(1),
        task_id: uuid(2),
        task_revision: 1,
        active_set_revision: 0,
        status: "clear",
        code_coverage: "partial_evidence",
        checked_source_ids: [uuid(3)],
        evidence_ids: [uuid(3)],
        implementation_findings: [],
        relation_findings: [],
        limitations: [],
        allowed_actions: ["proceed"],
      }).success,
    ).toBe(false);
  });

  it("rejects findings that cite evidence outside the result's allowlist", () => {
    const result = preflightResultSchema.safeParse({
      check_id: uuid(1),
      task_id: uuid(2),
      task_revision: 1,
      active_set_revision: 0,
      status: "review_suggested",
      code_coverage: "present_evidence",
      checked_source_ids: [uuid(7)],
      evidence_ids: [uuid(8)],
      implementation_findings: [],
      relation_findings: [
        { candidate_task_id: uuid(3), relation: "duplicate_outcome", evidence_ids: [uuid(9)], freshness: "current" },
      ],
      limitations: [],
      allowed_actions: ["coordinate", "proceed"],
    });
    expect(result.success).toBe(false);
  });
});

describe("provider boundary", () => {
  it("returns unknown for missing providers, timeout, and evidence IDs outside the allowed set", async () => {
    const input = makeProviderInput();
    expect((await classifyRelations(undefined, input)).status).toEqual("unknown");
    expect(await classifyRelations(undefined, input)).toMatchObject({ reason: "provider_unavailable" });

    const timeoutOutcome = await classifyRelations(
      { classify: () => new Promise(() => undefined) },
      input,
      { timeoutMs: 5 },
    );
    expect(timeoutOutcome).toMatchObject({ status: "unknown", reason: "timeout" });

    const invalidReference = await classifyRelations(
      {
        classify: async () => ({
          considered_candidate_ids: [uuid(5)],
          findings: [{ candidate_task_id: uuid(5), relation: "duplicate_outcome", evidence_ids: [uuid(99)] }],
        }),
      },
      input,
    );
    expect(invalidReference).toMatchObject({ status: "unknown", reason: "invalid_response" });
  });

  it("accepts only findings grounded in authorized candidate evidence", async () => {
    const outcome = await classifyRelations(
      {
        classify: async () => ({
          considered_candidate_ids: [uuid(5)],
          findings: [{ candidate_task_id: uuid(5), relation: "duplicate_outcome", evidence_ids: [uuid(6)] }],
        }),
      },
      makeProviderInput(),
    );
    expect(outcome).toMatchObject({ status: "available", decision: { findings: [{ relation: "duplicate_outcome" }] } });
  });
});

describe("resolution and task lifecycle guards", () => {
  it("rejects expired, consumed, wrong-session, and wrong-revision resolutions", () => {
    const resolution = validResolution();
    expect(checkResolutionAccess(resolution, accessRequest())).toEqual({ allowed: true });
    expect(checkResolutionAccess(resolution, accessRequest({ session_id: uuid(99) }))).toEqual({ allowed: false, code: "wrong_session" });
    expect(checkResolutionAccess(resolution, accessRequest({ task_revision: 3 }))).toEqual({ allowed: false, code: "wrong_revision" });
    expect(checkResolutionAccess(resolution, accessRequest({ now: "2026-10-03T19:00:00Z" }))).toEqual({ allowed: false, code: "expired" });
    expect(
      checkResolutionAccess(resolutionSchema.parse({ ...resolution, consumed_at: "2026-10-03T18:20:00Z" }), accessRequest()),
    ).toEqual({ allowed: false, code: "consumed" });
  });

  it("enforces review and owner-controlled task transitions", () => {
    expect(transitionTaskState("active", "awaiting_review", "agent")).toEqual({ allowed: true, state: "awaiting_review" });
    expect(transitionTaskState("awaiting_review", "done", "agent")).toMatchObject({ allowed: false, code: "actor_not_allowed" });
    expect(transitionTaskState("awaiting_review", "done", "builder")).toEqual({ allowed: true, state: "done" });
    expect(transitionTaskState("active", "paused", "agent")).toMatchObject({ allowed: false, code: "actor_not_allowed" });
    expect(transitionTaskState("active", "paused", "owner")).toEqual({ allowed: true, state: "paused" });
    expect(transitionTaskState("done", "active", "owner")).toMatchObject({ allowed: false, code: "transition_not_allowed" });
  });
});

describe("freshness", () => {
  const now = new Date("2026-10-03T18:00:00Z");

  it("distinguishes current, stale, missing, and future heartbeat times", () => {
    expect(classifyEvidenceFreshness("2026-10-03T17:59:30Z", now, 60_000)).toBe("current");
    expect(classifyEvidenceFreshness("2026-10-03T17:57:00Z", now, 60_000)).toBe("stale");
    expect(classifyEvidenceFreshness(null, now, 60_000)).toBe("missing");
    expect(classifyEvidenceFreshness("2026-10-03T18:01:00Z", now, 60_000)).toBe("stale");
  });
});
