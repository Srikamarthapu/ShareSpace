export type Builder = "Sam" | "Sri";
export type Agent = "Claude Code" | "Codex";

/** Browser-only sample display data. This is not an API contract. */
export type DashboardSession = {
  id: string;
  title: string;
  owner: Builder;
  agent: Agent;
  repository: string;
  branch: string;
  latestPrompt: string;
  lastActivityAt: string;
  scope: string;
  files: string[];
  captureNote: string;
};

export const SAMPLE_SNAPSHOT_AT = "2026-10-03T17:40:00Z";

export const sampleSessions: readonly DashboardSession[] = [
  {
    id: "sample-sam",
    title: "Saved-college API",
    owner: "Sam",
    agent: "Claude Code",
    repository: "college-compass",
    branch: "feature/saved-colleges",
    latestPrompt:
      "Build the saved-college API. Each person should be able to save, list, and remove their own colleges. I’ll own the backend and access checks.",
    lastActivityAt: "2026-10-03T17:35:00Z",
    scope: "Create the saved-college endpoints, persistence, and per-user access checks.",
    files: ["app/api/saved/route.ts", "lib/saved-colleges.ts"],
    captureNote: "Redacted sample tool activity; source content is omitted.",
  },
  {
    id: "sample-sri",
    title: "Personal shortlist",
    owner: "Sri",
    agent: "Codex",
    repository: "college-compass",
    branch: "feature/shortlist",
    latestPrompt:
      "Build a personal shortlist so people can save colleges and manage their choices. Include the backend needed to store each person’s list.",
    lastActivityAt: "2026-10-03T17:38:00Z",
    scope: "Let people save colleges to a personal shortlist and manage their saved choices.",
    files: ["app/shortlist/page.tsx"],
    captureNote: "Scripted sample coordination finding; no live provider result is represented.",
  },
];

export type SessionFilters = {
  builder: "all" | Builder;
  agent: "all" | Agent;
  query: string;
};

export function filterSessions(
  sessions: readonly DashboardSession[],
  filters: SessionFilters,
): DashboardSession[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = sessions.filter((session) => {
    if (filters.builder !== "all" && session.owner !== filters.builder) return false;
    if (filters.agent !== "all" && session.agent !== filters.agent) return false;
    if (!query) return true;

    return [
      session.title,
      session.latestPrompt,
      session.branch,
      session.repository,
      session.owner,
      session.agent,
    ].some((value) => value.toLowerCase().includes(query));
  });

  return [...filtered].sort((left, right) => {
    const leftTime = Date.parse(left.lastActivityAt);
    const rightTime = Date.parse(right.lastActivityAt);
    const safeLeftTime = Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime;
    const safeRightTime = Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime;
    if (safeLeftTime === safeRightTime) return 0;
    return safeRightTime > safeLeftTime ? 1 : -1;
  });
}

export function formatActivityAge(occurredAt: string | null, asOf: string): string {
  if (occurredAt === null) return "Activity unavailable";

  const occurred = Date.parse(occurredAt);
  const reference = Date.parse(asOf);
  if (!Number.isFinite(occurred) || !Number.isFinite(reference) || occurred > reference) {
    return "Activity unavailable";
  }

  const elapsed = reference - occurred;
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(elapsed / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
