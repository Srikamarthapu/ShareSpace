import type {
  CleanupNoticeRow,
  DeviceRow,
  EventRow,
  IngestResponse,
  MemberRow,
  OverlapCheckRow,
  PairingView,
  RepositoryRow,
  SessionRow,
  StorageStatus,
  TeamRow,
} from "./v1";

/**
 * Sample rows that match the v1 contract, one per UI state. SAMPLE ONLY: never show these
 * as live data. Tests parse every value here against the contract.
 */
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const at = (minute: number) => `2026-10-03T17:${minute.toString().padStart(2, "0")}:00.000Z`;

const team: TeamRow = { id: id(1), name: "College Compass", created_at: at(0) };
const repository: RepositoryRow = {
  id: id(2),
  team_id: team.id,
  name: "sample/college-compass",
  created_at: at(0),
};
const sri = id(10);
const sam = id(11);

const members: MemberRow[] = [
  {
    team_id: team.id,
    user_id: sri,
    role: "admin",
    display_name: "Sri",
    avatar_url: null,
    joined_at: at(1),
  },
  {
    team_id: team.id,
    user_id: sam,
    role: "member",
    display_name: "Sam",
    avatar_url: null,
    joined_at: at(2),
  },
];

const device: DeviceRow = {
  id: id(20),
  user_id: sri,
  team_id: team.id,
  repository_id: repository.id,
  name: "Sri's laptop",
  agent: "claude_code",
  agent_version: "2.1.287",
  capabilities: {
    event_capture: "partial",
    overlap_check: "supported",
    warning_delivery: "supported",
  },
  status: "approved",
  created_at: at(3),
  last_used_at: at(38),
  revoked_at: null,
};

const pendingPairing: PairingView = {
  id: id(21),
  user_code: "WXYZ-2345",
  agent: "codex",
  agent_version: "0.145.0",
  device_name: "Sam's laptop",
  repository_name: "sample/college-compass",
  repository_id: repository.id,
  capabilities: {
    event_capture: "partial",
    overlap_check: "unsupported",
    warning_delivery: "unsupported",
  },
  status: "pending",
  expires_at: at(45),
};

const baseSession: SessionRow = {
  id: id(30),
  team_id: team.id,
  repository_id: repository.id,
  user_id: sri,
  device_id: device.id,
  agent: "claude_code",
  agent_version: "2.1.287",
  branch: "feature/shortlist",
  title: "Build a personal shortlist",
  latest_prompt: "Build a personal shortlist so people can save colleges.",
  touched_paths: ["app/shortlist/page.tsx"],
  visibility: "shared",
  capture_limitations: ["Assistant replies are not captured by this agent version."],
  started_at: at(30),
  last_activity_at: at(38),
  ended_at: null,
  event_count: 4,
  history_removed_at: null,
  history_removed_reason: null,
};

const sessions: Record<"active" | "private" | "removed", SessionRow> = {
  active: baseSession,
  private: { ...baseSession, id: id(31), visibility: "private", title: "Private spike" },
  removed: {
    ...baseSession,
    id: id(32),
    title: "Old session",
    latest_prompt: null,
    touched_paths: [],
    event_count: 0,
    history_removed_at: at(40),
    history_removed_reason: "pruned",
  },
};

const eventBase = {
  session_id: baseSession.id,
  team_id: team.id,
  redacted: false,
  truncated: false,
};

const events: EventRow[] = [
  {
    ...eventBase,
    id: id(40),
    ingest_id: 1,
    sequence: 0,
    occurred_at: at(30),
    received_at: at(30),
    kind: "session.started",
    payload: { branch: "feature/shortlist", agent_version: "2.1.287", capture_limitations: [] },
  },
  {
    ...eventBase,
    id: id(41),
    ingest_id: 2,
    sequence: 1,
    occurred_at: at(31),
    received_at: at(31),
    kind: "user.message",
    payload: {
      text: "Build a personal shortlist so people can save colleges.",
      branch: "feature/shortlist",
    },
  },
  {
    ...eventBase,
    id: id(42),
    ingest_id: 3,
    sequence: 2,
    occurred_at: at(32),
    received_at: at(32),
    kind: "tool.started",
    payload: {
      tool_call_id: "toolu_sample_1",
      tool_name: "Read",
      input_excerpt: null,
      relative_paths: ["app/shortlist/page.tsx"],
    },
  },
  {
    ...eventBase,
    id: id(43),
    ingest_id: 4,
    sequence: 3,
    occurred_at: at(33),
    received_at: at(33),
    redacted: true,
    truncated: true,
    kind: "tool.completed",
    payload: {
      tool_call_id: "toolu_sample_1",
      tool_name: "Read",
      status: "success",
      output_excerpt: "export default function Shortlist() { … [REDACTED] …",
      relative_paths: ["app/shortlist/page.tsx"],
      duration_ms: 12,
    },
  },
];

const checkBase = {
  team_id: team.id,
  repository_id: repository.id,
  session_id: baseSession.id,
  user_id: sri,
  trigger_event_id: id(41),
  request_excerpt: "Build a personal shortlist so people can save colleges.",
};

const overlapChecks: Record<"warning" | "no_overlap" | "unavailable", OverlapCheckRow> = {
  warning: {
    ...checkBase,
    id: id(50),
    outcome: "warning",
    findings: [
      {
        related_session_id: id(33),
        related_user_id: sam,
        relation: "overlapping",
        score: 0.91,
        summary: "Both sessions add per-person saved-college storage.",
        evidence: [
          { session_id: id(33), event_id: id(60), excerpt: "Build the saved-college API." },
        ],
      },
    ],
    unavailable_reason: null,
    created_at: at(31),
  },
  no_overlap: {
    ...checkBase,
    id: id(51),
    outcome: "no_overlap",
    findings: [],
    unavailable_reason: null,
    created_at: at(32),
  },
  unavailable: {
    ...checkBase,
    id: id(52),
    outcome: "unavailable",
    findings: [],
    unavailable_reason: "timeout",
    created_at: at(33),
  },
};

const storage: Record<"ok" | "cleanup" | "paused" | "unknown", StorageStatus> = {
  ok: {
    person: { accounted_bytes: 12_000_000, limit_bytes: 50_000_000, state: "ok" },
    database: { database_bytes: 120_000_000, measured_at: at(35), state: "ok" },
  },
  cleanup: {
    person: { accounted_bytes: 41_000_000, limit_bytes: 50_000_000, state: "cleanup" },
    database: { database_bytes: 150_000_000, measured_at: at(35), state: "ok" },
  },
  paused: {
    person: { accounted_bytes: 20_000_000, limit_bytes: 50_000_000, state: "ok" },
    database: { database_bytes: 398_000_000, measured_at: at(35), state: "paused" },
  },
  unknown: {
    person: { accounted_bytes: 20_000_000, limit_bytes: 50_000_000, state: "ok" },
    database: { database_bytes: null, measured_at: null, state: "unknown" },
  },
};

const cleanupNotice: CleanupNoticeRow = {
  id: id(70),
  team_id: team.id,
  user_id: sri,
  reason: "quota",
  removed_session_ids: [sessions.removed.id],
  freed_bytes: 11_000_000,
  created_at: at(40),
};

const ingestResponse: IngestResponse = {
  results: [
    { event_id: id(41), outcome: "accepted" },
    { event_id: id(42), outcome: "duplicate" },
    { event_id: id(44), outcome: "rejected", code: "session_private" },
  ],
  sharing: { enabled: true, paused: false },
  storage_state: "ok",
};

export const V1_SAMPLE = {
  team,
  repository,
  members,
  device,
  pendingPairing,
  sessions,
  events,
  overlapChecks,
  storage,
  cleanupNotice,
  ingestResponse,
} as const;
