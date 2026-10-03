import { describe, expect, it } from "vitest";
import {
  eventAnchorPageStart,
  getSampleHistoryEvents,
  initialSampleHistory,
  mergeSampleEvents,
  parseSampleHistory,
  SAMPLE_HISTORY_LIMIT,
  sampleWarnings,
  sampleCatchupFor,
  sampleObservationAt,
  TRANSCRIPT_PAGE_SIZE,
  visibleSampleSessions,
  visibleSampleWarnings,
  warningTouchesRevokedHistory,
  type HistoryEvent,
  type SampleHistoryState,
} from "./history-model";

describe("sample history selectors", () => {
  it("updates observed activity when persisted catch-up arrives", () => {
    const state = { ...initialSampleHistory, receivedEvents: sampleCatchupFor("sample-sam") };
    expect(
      visibleSampleSessions(state).find((session) => session.id === "sample-sam")?.lastActivityAt,
    ).toBe("2026-10-03T18:01:00.000Z");
    expect(sampleObservationAt(state)).toBe("2026-10-03T18:01:00.000Z");
  });
  it("finds an older deep-link event on the page that contains it", () => {
    const events = getSampleHistoryEvents("sample-sam", initialSampleHistory);
    const initialPageStart = Math.max(0, events.length - TRANSCRIPT_PAGE_SIZE);
    const targetId = "sam-history-01";
    const targetStart = eventAnchorPageStart(events, targetId);

    expect(targetStart).not.toBeNull();
    expect(targetStart).toBeLessThan(initialPageStart);
    expect(
      events
        .slice(targetStart!, targetStart! + TRANSCRIPT_PAGE_SIZE)
        .some((event) => event.id === targetId),
    ).toBe(true);
    expect(eventAnchorPageStart(events, "missing-event")).toBeNull();
  });

  it("orders fixture events by their stable occurrence time", () => {
    const events = getSampleHistoryEvents("sample-sam", initialSampleHistory);
    expect(events.map((event) => Date.parse(event.occurredAt))).toEqual(
      [...events].map((event) => Date.parse(event.occurredAt)).sort((left, right) => left - right),
    );
  });

  it("deduplicates stable event IDs on repeated persisted catch-up delivery", () => {
    const event = getSampleHistoryEvents("sample-sam", initialSampleHistory).at(-1)!;
    const first = mergeSampleEvents([], [event, event]);
    const second = mergeSampleEvents(first.events, [event]);

    expect(first).toMatchObject({ added: 1, duplicates: 1 });
    expect(second).toMatchObject({ added: 0, duplicates: 1 });
    expect(second.events.map((item) => item.id)).toEqual([event.id]);
  });

  it("bounds catch-up history to twenty-four records", () => {
    const events = getSampleHistoryEvents("sample-sam", initialSampleHistory);
    const first = events[0]!;
    const candidates: HistoryEvent[] = Array.from({ length: 30 }, (_, index) => ({
      ...first,
      id: "bounded-" + index,
      occurredAt: new Date(Date.parse(first.occurredAt) + index * 1000).toISOString(),
    }));
    const merged = mergeSampleEvents([], candidates);

    expect(merged.events).toHaveLength(24);
    expect(merged.events[0]!.id).toBe("bounded-6");
    expect(merged.added).toBe(30);
  });

  it("resets malformed or oversized browser state to the bounded empty fixture", () => {
    expect(parseSampleHistory("{broken")).toEqual(initialSampleHistory);
    expect(parseSampleHistory("x".repeat(SAMPLE_HISTORY_LIMIT + 1))).toEqual(initialSampleHistory);
    expect(
      parseSampleHistory(JSON.stringify({ version: 1, receivedEvents: Array(25).fill({}) })),
    ).toEqual(initialSampleHistory);
  });

  it("hides deleted and revoked sessions and hides warnings that cite removed history", () => {
    const deleted: SampleHistoryState = {
      ...initialSampleHistory,
      deletedSessionIds: ["sample-sri"],
    };
    const revoked: SampleHistoryState = {
      ...initialSampleHistory,
      revokedSessionIds: ["sample-sam"],
    };

    expect(visibleSampleSessions(deleted).map((session) => session.id)).toEqual(["sample-sam"]);
    expect(getSampleHistoryEvents("sample-sri", deleted)).toEqual([]);
    expect(visibleSampleWarnings(deleted)).toEqual([]);
    expect(sampleWarnings.length).toBeGreaterThan(0);
    expect(visibleSampleSessions(revoked).map((session) => session.id)).toEqual(["sample-sri"]);
    expect(getSampleHistoryEvents("sample-sam", revoked)).toEqual([]);
    expect(warningTouchesRevokedHistory(["sample-sam"], revoked)).toBe(true);
  });
});
