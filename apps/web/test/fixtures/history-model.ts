import { z } from "zod";
import { sampleEvents, type SampleEvent } from "./sample-data";
import { sampleSessions, type DashboardSession } from "./session-model";

export const SAMPLE_HISTORY_STORAGE_KEY = "sharespace:sample:history:v1";
export const SAMPLE_HISTORY_LIMIT = 64_000;
export const TRANSCRIPT_PAGE_SIZE = 8;
export const SAMPLE_HISTORY_SNAPSHOT = "2026-10-03T10:40:00-07:00";
export const SAMPLE_PERSON = "Sri";

const fixtureSessionIds = ["sample-sam", "sample-sri"] as const;
const sampleEventSchema = z.object({
  id: z.string().min(1).max(80),
  sessionId: z.enum(fixtureSessionIds),
  role: z.enum(["user", "assistant", "tool"]),
  time: z.string().max(20),
  title: z.string().min(1).max(120),
  content: z.string().max(4000),
  occurredAt: z.string().datetime({ offset: true }),
  file: z.string().max(200).optional(),
  redacted: z.boolean(),
  truncated: z.boolean(),
  status: z.enum(["success", "error", "running"]),
});

export type HistoryEvent = z.infer<typeof sampleEventSchema>;
export type StreamStatus = "connected" | "paused" | "unavailable";
const historyStateSchema = z.object({
  version: z.literal(1),
  deletedSessionIds: z.array(z.enum(fixtureSessionIds)).max(2),
  revokedSessionIds: z.array(z.enum(fixtureSessionIds)).max(2),
  streamStatus: z.enum(["connected", "paused", "unavailable"]),
  receivedEvents: z.array(sampleEventSchema).max(24),
  lastCatchup: z
    .object({
      added: z.number().int().min(0).max(24),
      duplicates: z.number().int().min(0).max(24),
    })
    .nullable(),
});

export type SampleHistoryState = z.infer<typeof historyStateSchema>;

export const initialSampleHistory: SampleHistoryState = {
  version: 1,
  deletedSessionIds: [],
  revokedSessionIds: [],
  streamStatus: "connected",
  receivedEvents: [],
  lastCatchup: null,
};

function asHistoryEvent(event: SampleEvent): HistoryEvent {
  const isoTime = new Date("2026-10-03T" + event.time + ":00-07:00").toISOString();
  return sampleEventSchema.parse({
    ...event,
    occurredAt: isoTime,
    redacted: event.role === "tool",
    truncated: false,
    status: "success",
  });
}

function makeFixtureEvent(
  id: string,
  minuteOffset: number,
  role: HistoryEvent["role"],
  title: string,
  content: string,
  options: Partial<Pick<HistoryEvent, "file" | "redacted" | "truncated" | "status">> = {},
): HistoryEvent {
  const happenedAt = new Date(Date.parse("2026-10-03T17:35:00Z") + minuteOffset * 60_000);
  return sampleEventSchema.parse({
    id,
    sessionId: "sample-sam",
    role,
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(happenedAt),
    title,
    content,
    occurredAt: happenedAt.toISOString(),
    redacted: Boolean(options.redacted),
    truncated: Boolean(options.truncated),
    status: options.status ?? "success",
    ...(options.file ? { file: options.file } : {}),
  });
}

const historyFixtureEvents: HistoryEvent[] = [
  ...sampleEvents.map(asHistoryEvent),
  ...Array.from({ length: 16 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const isTool = index % 3 === 1;
    return makeFixtureEvent(
      "sam-history-" + number,
      index + 1,
      isTool ? "tool" : "assistant",
      isTool ? "Redacted sample tool activity · " + number : "Sample progress note · " + number,
      isTool
        ? JSON.stringify(
            {
              tool_name: "Read",
              status: "success",
              relative_path: "app/api/saved/route.ts",
              result_excerpt: "Bounded sample excerpt",
              redacted: true,
            },
            null,
            2,
          )
        : "Fixture activity " +
            number +
            ": checked the saved-college flow and recorded a short, user-visible update.",
      isTool
        ? { file: "app/api/saved/route.ts", redacted: true }
        : index === 14
          ? { truncated: true }
          : {},
    );
  }),
];

const catchupEvents: Record<(typeof fixtureSessionIds)[number], HistoryEvent[]> = {
  "sample-sam": [
    makeFixtureEvent(
      "sam-catchup-01",
      25,
      "assistant",
      "Recovered sample progress",
      "This persisted fixture update was available during reconnect recovery.",
    ),
    makeFixtureEvent(
      "sam-catchup-02",
      26,
      "tool",
      "Recovered redacted tool result",
      JSON.stringify(
        {
          tool_name: "Test",
          status: "success",
          result_excerpt: "Sample test summary",
          redacted: true,
        },
        null,
        2,
      ),
      { file: "tests/saved-colleges.test.ts", redacted: true },
    ),
  ],
  "sample-sri": [
    sampleEventSchema.parse({
      id: "sri-catchup-01",
      sessionId: "sample-sri",
      role: "assistant",
      time: "10:46",
      title: "Recovered sample progress",
      content: "This persisted fixture update was available during reconnect recovery.",
      occurredAt: "2026-10-03T17:46:00.000Z",
      redacted: false,
      truncated: false,
      status: "success",
    }),
  ],
};

export function parseSampleHistory(raw: string | null): SampleHistoryState {
  if (!raw || raw.length > SAMPLE_HISTORY_LIMIT) return structuredClone(initialSampleHistory);
  try {
    return historyStateSchema.parse(JSON.parse(raw));
  } catch {
    return structuredClone(initialSampleHistory);
  }
}

export function visibleSampleSessions(state: SampleHistoryState): DashboardSession[] {
  const deleted = new Set(state.deletedSessionIds);
  const revoked = new Set(state.revokedSessionIds);
  return sampleSessions
    .filter((session) => {
      const id = session.id as (typeof fixtureSessionIds)[number];
      return !deleted.has(id) && !revoked.has(id);
    })
    .map((session) => {
      const observed = state.receivedEvents.filter((event) => event.sessionId === session.id);
      const lastActivityAt = new Date(
        Math.max(
          Date.parse(session.lastActivityAt),
          ...observed.map((event) => Date.parse(event.occurredAt)),
        ),
      ).toISOString();
      return { ...session, lastActivityAt };
    });
}

export function sampleObservationAt(state: SampleHistoryState): string {
  return new Date(
    Math.max(
      Date.parse(SAMPLE_HISTORY_SNAPSHOT),
      ...state.receivedEvents.map((event) => Date.parse(event.occurredAt)),
    ),
  ).toISOString();
}

export function sampleObservationLabel(state: SampleHistoryState): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(new Date(sampleObservationAt(state)));
}

export function isSampleSessionDeleted(state: SampleHistoryState, sessionId: string): boolean {
  return state.deletedSessionIds.includes(sessionId as (typeof fixtureSessionIds)[number]);
}

export function isSampleSessionAccessRevoked(
  state: SampleHistoryState,
  sessionId: string,
): boolean {
  return state.revokedSessionIds.includes(sessionId as (typeof fixtureSessionIds)[number]);
}

export function getSampleHistoryEvents(
  sessionId: string,
  state: SampleHistoryState,
): HistoryEvent[] {
  if (isSampleSessionDeleted(state, sessionId) || isSampleSessionAccessRevoked(state, sessionId))
    return [];
  const seed = historyFixtureEvents.filter((event) => event.sessionId === sessionId);
  const received = state.receivedEvents.filter((event) => event.sessionId === sessionId);
  const unique = new Map<string, HistoryEvent>();
  for (const event of [...seed, ...received]) unique.set(event.id, event);
  return [...unique.values()].sort((left, right) => {
    const timeOrder = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return timeOrder || left.id.localeCompare(right.id);
  });
}

export function findSampleEvent(
  sessionId: string,
  eventId: string,
  state: SampleHistoryState,
): HistoryEvent | undefined {
  return getSampleHistoryEvents(sessionId, state).find((event) => event.id === eventId);
}

export function mergeSampleEvents(
  existing: readonly HistoryEvent[],
  incoming: readonly HistoryEvent[],
): { events: HistoryEvent[]; added: number; duplicates: number } {
  const byId = new Map(existing.map((event) => [event.id, event]));
  let added = 0;
  let duplicates = 0;
  for (const candidate of incoming) {
    if (byId.has(candidate.id)) {
      duplicates += 1;
      continue;
    }
    byId.set(candidate.id, candidate);
    added += 1;
  }
  return {
    events: [...byId.values()]
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
      .slice(-24),
    added,
    duplicates,
  };
}

export function sampleCatchupFor(sessionId: string): HistoryEvent[] {
  return catchupEvents[sessionId as (typeof fixtureSessionIds)[number]] ?? [];
}

export function warningTouchesDeletedHistory(
  evidenceSessionIds: readonly string[],
  state: SampleHistoryState,
): boolean {
  return evidenceSessionIds.some((id) => isSampleSessionDeleted(state, id));
}

export function warningTouchesRevokedHistory(
  evidenceSessionIds: readonly string[],
  state: SampleHistoryState,
): boolean {
  return evidenceSessionIds.some((id) => isSampleSessionAccessRevoked(state, id));
}

export function visibleSampleWarnings(state: SampleHistoryState): SampleWarning[] {
  return sampleWarnings.filter(
    (warning) =>
      !warningTouchesDeletedHistory(
        warning.evidence.map((item) => item.sessionId),
        state,
      ),
  );
}

export function eventAnchorPageStart(
  events: readonly HistoryEvent[],
  eventId: string,
  pageSize = TRANSCRIPT_PAGE_SIZE,
): number | null {
  const targetIndex = events.findIndex((event) => event.id === eventId);
  return targetIndex < 0 ? null : Math.floor(targetIndex / pageSize) * pageSize;
}

export type WarningOutcome = "warning" | "no_overlap" | "unavailable";
export type SampleWarningEvidence = {
  sessionId: string;
  eventId: string;
  label: string;
  excerpt: string;
};
export type SampleWarning = {
  id: string;
  outcome: WarningOutcome;
  title: string;
  summary: string;
  happenedAt: string;
  evidence: SampleWarningEvidence[];
  unavailableReason?: string;
};

export const sampleWarnings: readonly SampleWarning[] = [
  {
    id: "college-scope",
    outcome: "warning",
    title: "Personal shortlist and saved-college API",
    summary: "Both sample requests mention per-person saved-college storage and management.",
    happenedAt: "2026-10-03T17:39:00Z",
    evidence: [
      {
        sessionId: "sample-sri",
        eventId: "sri-request",
        label: "Sri’s request",
        excerpt: "Save colleges to a personal shortlist and manage each person’s choices.",
      },
      {
        sessionId: "sample-sam",
        eventId: "sam-request",
        label: "Sam’s request",
        excerpt: "Save, list, and remove each person’s own colleges.",
      },
    ],
  },
  {
    id: "deployment-notes",
    outcome: "no_overlap",
    title: "Deployment notes check",
    summary: "The sample check completed and found no related session in this project.",
    happenedAt: "2026-10-03T17:32:00Z",
    evidence: [
      {
        sessionId: "sample-sri",
        eventId: "sri-response",
        label: "Checked sample request",
        excerpt: "A completed fixture check with no related implementation request.",
      },
    ],
  },
  {
    id: "context-timeout",
    outcome: "unavailable",
    title: "Repository context check",
    summary: "The sample context lookup did not complete, so no overlap result was produced.",
    happenedAt: "2026-10-03T17:30:00Z",
    evidence: [
      {
        sessionId: "sample-sri",
        eventId: "sri-request",
        label: "Checked sample request",
        excerpt: "The request remains available while its context check is unavailable.",
      },
    ],
    unavailableReason: "Sample context provider unavailable. No clear result was recorded.",
  },
];

export type StorageScenarioId = "warning" | "cleanup" | "paused" | "unknown";
export type StorageScenario = {
  id: StorageScenarioId;
  label: string;
  personMb: number;
  projectedPersonMb: number;
  databaseMb: number | null;
  projectedDatabaseMb: number | null;
  cleanupMb?: number;
};

export const sampleStorageScenarios: readonly [StorageScenario, ...StorageScenario[]] = [
  {
    id: "warning",
    label: "Per-person warning",
    personMb: 42,
    projectedPersonMb: 44,
    databaseMb: 338,
    projectedDatabaseMb: 346,
  },
  {
    id: "cleanup",
    label: "Cleanup available",
    personMb: 42,
    projectedPersonMb: 44,
    databaseMb: 343,
    projectedDatabaseMb: 349,
    cleanupMb: 29.8,
  },
  {
    id: "paused",
    label: "Uploads paused",
    personMb: 36,
    projectedPersonMb: 37,
    databaseMb: 389,
    projectedDatabaseMb: 401,
  },
  {
    id: "unknown",
    label: "Capacity unknown",
    personMb: 34,
    projectedPersonMb: 35,
    databaseMb: null,
    projectedDatabaseMb: null,
  },
];
