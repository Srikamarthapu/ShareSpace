import { describe, expect, it } from "vitest";
import {
  filterSessions,
  formatActivityAge,
  sampleSessions,
  type DashboardSession,
} from "./session-model";

describe("filterSessions", () => {
  it("combines builder, agent, and trimmed case-insensitive query filters", () => {
    const result = filterSessions(sampleSessions, {
      builder: "Sam",
      agent: "Claude Code",
      query: "  SAVED-COLLEGE  ",
    });

    expect(result.map((session) => session.id)).toEqual(["sample-sam"]);
    expect(
      filterSessions(sampleSessions, {
        builder: "Sam",
        agent: "Codex",
        query: "saved-college",
      }),
    ).toEqual([]);
    expect(
      filterSessions(sampleSessions, {
        builder: "all",
        agent: "all",
        query: "no matching session",
      }),
    ).toEqual([]);
  });

  it("sorts recent sessions first without mutating the provided list", () => {
    const reversed: DashboardSession[] = [sampleSessions[0]!, sampleSessions[1]!].reverse();
    const originalOrder = reversed.map((session) => session.id);

    const result = filterSessions(reversed, { builder: "all", agent: "all", query: "" });

    expect(result.map((session) => session.id)).toEqual(["sample-sri", "sample-sam"]);
    expect(reversed.map((session) => session.id)).toEqual(originalOrder);
  });
});

describe("formatActivityAge", () => {
  const asOf = "2026-10-03T17:40:00Z";

  it("formats elapsed minutes, hours, and days deterministically", () => {
    expect(formatActivityAge("2026-10-03T17:38:00Z", asOf)).toBe("2 minutes ago");
    expect(formatActivityAge("2026-10-03T17:39:30Z", asOf)).toBe("Just now");
    expect(formatActivityAge("2026-10-03T16:40:00Z", asOf)).toBe("1 hour ago");
    expect(formatActivityAge("2026-10-02T17:40:00Z", asOf)).toBe("1 day ago");
  });

  it("labels missing, invalid, and future timestamps as unavailable", () => {
    expect(formatActivityAge(null, asOf)).toBe("Activity unavailable");
    expect(formatActivityAge("not-a-timestamp", asOf)).toBe("Activity unavailable");
    expect(formatActivityAge("2026-10-03T17:40:01Z", asOf)).toBe("Activity unavailable");
  });
});
