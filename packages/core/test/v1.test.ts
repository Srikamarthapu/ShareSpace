import { describe, expect, it } from "vitest";
import {
  EVENT_BATCH_MAX_COUNT,
  SHARESPACE_TOKEN_PATTERN,
  V1_SAMPLE,
  cleanupNoticeRowSchema,
  devicesResponseSchemas,
  deviceRowSchema,
  eventRole,
  eventRowSchema,
  ingestEventSchema,
  ingestFailureAction,
  ingestRequestSchema,
  ingestResponseSchema,
  memberRowSchema,
  normalizeRepositoryRemote,
  overlapCheckRowSchema,
  pairingViewSchema,
  repositoryRowSchema,
  sessionRowSchema,
  sharingRequestSchema,
  storageStatusSchema,
  teamRowSchema,
  teamsRequestSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

function userMessage(overrides: Record<string, unknown> = {}) {
  return {
    event_id: uuid(1),
    session_id: uuid(2),
    sequence: 0,
    occurred_at: "2026-10-03T18:00:00Z",
    redacted: false,
    truncated: false,
    kind: "user.message",
    payload: { text: "Add bookmarks", branch: "main" },
    ...overrides,
  };
}

describe("v1 sample fixtures", () => {
  it("match the contract", () => {
    teamRowSchema.parse(V1_SAMPLE.team);
    repositoryRowSchema.parse(V1_SAMPLE.repository);
    V1_SAMPLE.members.forEach((member) => memberRowSchema.parse(member));
    deviceRowSchema.parse(V1_SAMPLE.device);
    pairingViewSchema.parse(V1_SAMPLE.pendingPairing);
    Object.values(V1_SAMPLE.sessions).forEach((session) => sessionRowSchema.parse(session));
    V1_SAMPLE.events.forEach((event) => eventRowSchema.parse(event));
    Object.values(V1_SAMPLE.overlapChecks).forEach((check) => overlapCheckRowSchema.parse(check));
    Object.values(V1_SAMPLE.storage).forEach((status) => storageStatusSchema.parse(status));
    cleanupNoticeRowSchema.parse(V1_SAMPLE.cleanupNotice);
    ingestResponseSchema.parse(V1_SAMPLE.ingestResponse);
  });
});

describe("normalizeRepositoryRemote", () => {
  it.each([
    ["git@github.com:Owner/Repo.git", "owner/repo"],
    ["https://github.com/owner/repo", "owner/repo"],
    ["https://github.com/owner/repo.git/", "owner/repo"],
    ["ssh://git@github.com/owner/repo.git", "owner/repo"],
  ])("normalizes %s", (remote, expected) => {
    expect(normalizeRepositoryRemote(remote)).toBe(expected);
  });

  it.each(["/home/me/repo", "https://github.com/owner", "https://gitlab.com/group/sub/repo", ""])(
    "rejects %s",
    (remote) => {
      expect(normalizeRepositoryRemote(remote)).toBeNull();
    },
  );
});

describe("ingest events", () => {
  it("accepts a valid event", () => {
    expect(ingestEventSchema.parse(userMessage()).kind).toBe("user.message");
  });

  it("rejects a payload that belongs to another kind", () => {
    const result = ingestEventSchema.safeParse(
      userMessage({ payload: { tool_name: "Read", text: "x", branch: null } }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unsafe paths", () => {
    const result = ingestEventSchema.safeParse(
      userMessage({
        kind: "tool.started",
        payload: {
          tool_call_id: "t1",
          tool_name: "Read",
          input_excerpt: null,
          relative_paths: ["../secrets.txt"],
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an event over 16 KiB even when each field is in bounds", () => {
    // 2,000 emoji = 4,000 UTF-16 units (allowed) = 8,000 bytes; 50 long paths add about 9,000 more.
    const result = ingestEventSchema.safeParse(
      userMessage({
        kind: "tool.started",
        payload: {
          tool_call_id: "t1",
          tool_name: "Bash",
          input_excerpt: "😀".repeat(2_000),
          relative_paths: Array.from({ length: 50 }, (_, i) => `${"d".repeat(180)}/${i}.ts`),
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("limits batch size", () => {
    const events = Array.from({ length: EVENT_BATCH_MAX_COUNT + 1 }, (_, i) =>
      userMessage({ event_id: uuid(100 + i), sequence: i }),
    );
    expect(ingestRequestSchema.safeParse({ events }).success).toBe(false);
    expect(ingestRequestSchema.safeParse({ events: events.slice(1) }).success).toBe(true);
  });
});

describe("overlap check rows", () => {
  const { warning, no_overlap, unavailable } = V1_SAMPLE.overlapChecks;

  it("requires an overlapping finding for a warning", () => {
    expect(overlapCheckRowSchema.safeParse({ ...warning, findings: [] }).success).toBe(false);
  });

  it("forbids an overlapping finding when there is no overlap", () => {
    expect(
      overlapCheckRowSchema.safeParse({ ...no_overlap, findings: warning.findings }).success,
    ).toBe(false);
  });

  it("keeps unavailable separate from a completed check", () => {
    expect(
      overlapCheckRowSchema.safeParse({ ...unavailable, unavailable_reason: null }).success,
    ).toBe(false);
    expect(
      overlapCheckRowSchema.safeParse({ ...unavailable, findings: warning.findings }).success,
    ).toBe(false);
    expect(
      overlapCheckRowSchema.safeParse({ ...no_overlap, unavailable_reason: "timeout" }).success,
    ).toBe(false);
  });
});

describe("other rules", () => {
  it("needs both removed-history fields or neither", () => {
    const session = { ...V1_SAMPLE.sessions.active, history_removed_at: "2026-10-03T18:00:00Z" };
    expect(sessionRowSchema.safeParse(session).success).toBe(false);
  });

  it("needs at least one sharing change", () => {
    expect(
      sharingRequestSchema.safeParse({ action: "set_sharing", repository_id: uuid(1) }).success,
    ).toBe(false);
  });

  it("rejects unknown team actions and extra fields", () => {
    expect(teamsRequestSchema.safeParse({ action: "delete_team", team_id: uuid(1) }).success).toBe(
      false,
    );
    expect(
      teamsRequestSchema.safeParse({ action: "rotate_invite", team_id: uuid(1), user_id: uuid(2) })
        .success,
    ).toBe(false);
  });

  it("returns the device token only on approval", () => {
    const poll = devicesResponseSchemas.poll_pairing;
    expect(
      poll.safeParse({ status: "pending", device_token: `ssd-${"a".repeat(64)}` }).success,
    ).toBe(false);
  });

  it("finds ShareSpace tokens in text for redaction", () => {
    const token = `ssd-${"ab".repeat(32)}`;
    expect(`token=${token} done`.match(SHARESPACE_TOKEN_PATTERN)).toEqual([token]);
  });

  it("maps event kinds to transcript roles", () => {
    expect(eventRole("user.message")).toBe("user");
    expect(eventRole("tool.completed")).toBe("tool");
    expect(eventRole("session.started")).toBe("system");
  });

  it("bounds the local queue on refusals", () => {
    expect(ingestFailureAction("unavailable")).toBe("retry");
    expect(ingestFailureAction("payload_too_large")).toBe("drop_batch");
    for (const code of [
      "device_revoked",
      "not_member",
      "sharing_paused",
      "storage_paused",
    ] as const) {
      expect(ingestFailureAction(code)).toBe("drop_queue");
    }
  });
});
