"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  initialSampleHistory,
  mergeSampleEvents,
  parseSampleHistory,
  sampleCatchupFor,
  SAMPLE_HISTORY_LIMIT,
  SAMPLE_HISTORY_STORAGE_KEY,
  type SampleHistoryState,
  type StreamStatus,
  SAMPLE_PERSON,
} from "./history-model";
import { sampleSessions } from "../workspace/session-model";

const changeEvent = "sharespace:history:changed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SAMPLE_HISTORY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot() {
  return readRaw();
}

function getServerSnapshot() {
  return null;
}

function persist(next: SampleHistoryState): boolean {
  try {
    const validated = parseSampleHistory(JSON.stringify(next));
    if (JSON.stringify(validated) !== JSON.stringify(next)) return false;
    const encoded = JSON.stringify(validated);
    if (encoded.length > SAMPLE_HISTORY_LIMIT) return false;
    window.localStorage.setItem(SAMPLE_HISTORY_STORAGE_KEY, encoded);
    window.dispatchEvent(new Event(changeEvent));
    return true;
  } catch {
    return false;
  }
}

export function updateSampleHistory(
  mutate: (current: SampleHistoryState) => SampleHistoryState,
): boolean {
  const current = parseSampleHistory(readRaw());
  try {
    return persist(mutate(current));
  } catch {
    return false;
  }
}

export function setSampleStreamStatus(status: StreamStatus): boolean {
  return updateSampleHistory((current) => ({ ...current, streamStatus: status }));
}

export function reconnectSampleStream(
  sessionId: string,
): { added: number; duplicates: number } | null {
  if (sessionId !== "sample-sam" && sessionId !== "sample-sri") return null;
  const current = parseSampleHistory(readRaw());
  if (
    current.deletedSessionIds.includes(sessionId as "sample-sam" | "sample-sri") ||
    current.revokedSessionIds.includes(sessionId as "sample-sam" | "sample-sri")
  )
    return null;
  const delivery = mergeSampleEvents(current.receivedEvents, sampleCatchupFor(sessionId));
  const next = {
    ...current,
    streamStatus: "connected" as const,
    receivedEvents: delivery.events,
    lastCatchup: { added: delivery.added, duplicates: delivery.duplicates },
  };
  return persist(next) ? { added: delivery.added, duplicates: delivery.duplicates } : null;
}

export function deleteOwnSampleSession(sessionId: string, actor: string = SAMPLE_PERSON): boolean {
  const ownedSession = sampleSessions.find(
    (session) => session.id === sessionId && session.owner === actor,
  );
  if (!ownedSession || (sessionId !== "sample-sam" && sessionId !== "sample-sri")) return false;
  const ownedId = sessionId as "sample-sam" | "sample-sri";
  return updateSampleHistory((current) => ({
    ...current,
    deletedSessionIds: current.deletedSessionIds.includes(ownedId)
      ? current.deletedSessionIds
      : [...current.deletedSessionIds, ownedId],
    receivedEvents: current.receivedEvents.filter((event) => event.sessionId !== ownedId),
  }));
}

export function setSampleSessionAccessRevoked(sessionId: string, revoked: boolean): boolean {
  if (sessionId !== "sample-sam" && sessionId !== "sample-sri") return false;
  return updateSampleHistory((current) => {
    if (current.deletedSessionIds.includes(sessionId)) return current;
    const revokedSessionIds = new Set(current.revokedSessionIds);
    if (revoked) revokedSessionIds.add(sessionId);
    else revokedSessionIds.delete(sessionId);
    return {
      ...current,
      revokedSessionIds: [...revokedSessionIds],
      receivedEvents: revoked
        ? current.receivedEvents.filter((event) => event.sessionId !== sessionId)
        : current.receivedEvents,
    };
  });
}

export function useSampleHistory() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const state = useMemo(() => parseSampleHistory(raw), [raw]);
  return { state, update: updateSampleHistory };
}

export function resetSampleHistory() {
  try {
    window.localStorage.removeItem(SAMPLE_HISTORY_STORAGE_KEY);
    window.dispatchEvent(new Event(changeEvent));
    return true;
  } catch {
    return false;
  }
}

export { initialSampleHistory };
