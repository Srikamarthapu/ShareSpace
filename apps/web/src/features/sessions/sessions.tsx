"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  FileCode2,
  GitBranch,
  Info,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Avatar, CopyButton, EmptyState } from "@/components/ui";
import {
  sampleSessions,
  filterSessions,
  formatActivityAge,
  type Agent,
  type Builder,
} from "../workspace/session-model";
import { HistoryNavigation, SampleLabel } from "../history/history-navigation";
import {
  eventAnchorPageStart,
  getSampleHistoryEvents,
  sampleObservationAt,
  sampleObservationLabel,
  isSampleSessionAccessRevoked,
  isSampleSessionDeleted,
  TRANSCRIPT_PAGE_SIZE,
  type HistoryEvent,
  type StreamStatus,
  visibleSampleSessions,
} from "../history/history-model";
import {
  deleteOwnSampleSession,
  reconnectSampleStream,
  setSampleSessionAccessRevoked,
  setSampleStreamStatus,
  useSampleHistory,
} from "../history/history-store";
import styles from "../history/history.module.css";
import { sharingForMember, useWorkspaceControls } from "../workspace-controls/store";

function streamStatusCopy(status: StreamStatus) {
  if (status === "paused") return "Paused · sample updates are not being read.";
  if (status === "unavailable") return "Unavailable · stored sample history remains readable.";
  return "Ready · sample history is saved in this browser.";
}

export function Sessions() {
  const { state } = useSampleHistory();
  const [query, setQuery] = useState("");
  const sessions = filterSessions(visibleSampleSessions(state), {
    builder: "all",
    agent: "all",
    query,
  });

  return (
    <>
      <div className="page-heading">
        <div className="heading-copy">
          <div className="eyebrow">SHARED, WITH INTENT</div>
          <h1>Sessions</h1>
          <p>A window into the work. Only the conversations you choose to share.</p>
        </div>
      </div>
      <HistoryNavigation active="/sessions" />
      <div className={styles.sampleBand}>
        <Info size={16} aria-hidden="true" />
        <span>
          These scripted sessions live only in this browser. They do not represent live agent
          activity or a shared account.
        </span>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search sessions</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search builder, prompt, project, or branch…"
          />
        </label>
        <span className="muted small">{sessions.length} sample sessions</span>
      </div>
      <div className="session-list">
        {sessions.map((session) => (
          <Link className="session-row" key={session.id} href={"/sessions/" + session.id}>
            <Avatar name={session.owner} />
            <div>
              <h2>{session.title}</h2>
              <p>
                {session.owner} + {session.agent}{" "}
                <span>
                  · {session.repository} · {session.branch}
                </span>
              </p>
              <p className="muted small">
                Last activity{" "}
                {formatActivityAge(session.lastActivityAt, sampleObservationAt(state))} at the{" "}
                {sampleObservationLabel(state)} sample snapshot.
              </p>
            </div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
      {!sessions.length && (
        <EmptyState title={query ? "No matching sessions" : "No visible sample sessions"}>
          {query
            ? "Try another builder, agent, prompt, project, or branch."
            : "Deleted or access-revoked sample history is hidden from this list."}
        </EmptyState>
      )}
      <p className="understated-note">
        Reconnect and pagination below exercise browser fixtures only. Real capture and cross-client
        streaming are not connected.
      </p>
    </>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const { state } = useSampleHistory();
  const { actor, state: controls } = useWorkspaceControls();
  const currentOwner = actor?.id === "sri" ? "Sri" : actor?.id === "sam" ? "Sam" : "";
  const session =
    visibleSampleSessions(state).find((item) => item.id === id) ??
    sampleSessions.find((item) => item.id === id);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [requestedStart, setRequestedStart] = useState<number | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState("");
  const [newEvents, setNewEvents] = useState(false);
  const [catchupMessage, setCatchupMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const atBottomRef = useRef(false);
  const previousCountRef = useRef<number | null>(null);
  const previousSessionRef = useRef(id);
  const handledHashRef = useRef("");
  const preserveScrollRef = useRef<{ id: string; top: number } | null>(null);

  const allEvents = useMemo(() => getSampleHistoryEvents(id, state), [id, state]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEvents = allEvents.filter(
    (event) =>
      (kind === "all" || event.role === kind) &&
      (normalizedQuery === "" ||
        [event.title, event.content, event.file ?? ""].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        )),
  );
  const defaultStart = Math.max(0, filteredEvents.length - TRANSCRIPT_PAGE_SIZE);
  const visibleStart = Math.min(requestedStart ?? defaultStart, defaultStart);
  const visibleEvents = filteredEvents.slice(visibleStart, visibleStart + TRANSCRIPT_PAGE_SIZE);
  const deleted = isSampleSessionDeleted(state, id);
  const revoked = isSampleSessionAccessRevoked(state, id);

  useEffect(() => {
    const updateBottomState = () => {
      const documentHeight = document.documentElement.scrollHeight;
      atBottomRef.current = window.innerHeight + window.scrollY >= documentHeight - 72;
    };
    updateBottomState();
    window.addEventListener("scroll", updateBottomState, { passive: true });
    window.addEventListener("resize", updateBottomState);
    return () => {
      window.removeEventListener("scroll", updateBottomState);
      window.removeEventListener("resize", updateBottomState);
    };
  }, []);

  useEffect(() => {
    if (previousSessionRef.current !== id || previousCountRef.current === null) {
      previousSessionRef.current = id;
      previousCountRef.current = allEvents.length;
      return;
    }
    if (allEvents.length > previousCountRef.current) {
      if (atBottomRef.current) {
        setRequestedStart(null);
        setNewEvents(false);
        requestAnimationFrame(() => {
          const last = allEvents[allEvents.length - 1];
          if (last)
            document.getElementById(last.id)?.scrollIntoView({ behavior: "auto", block: "end" });
        });
      } else {
        setRequestedStart(visibleStart);
        setNewEvents(true);
      }
    }
    previousCountRef.current = allEvents.length;
  }, [allEvents, id, visibleStart]);

  useEffect(() => {
    const revealHash = () => {
      let eventId = "";
      try {
        eventId = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!eventId) {
        handledHashRef.current = "";
        return;
      }
      if (handledHashRef.current === eventId) return;
      const start = eventAnchorPageStart(allEvents, eventId);
      if (start === null) return;
      handledHashRef.current = eventId;
      atBottomRef.current = false;
      setQuery("");
      setKind("all");
      setRequestedStart(start);
      setPendingAnchor(eventId);
    };
    window.addEventListener("hashchange", revealHash);
    revealHash();
    return () => window.removeEventListener("hashchange", revealHash);
  }, [allEvents]);

  useEffect(() => {
    if (!pendingAnchor || !visibleEvents.some((event) => event.id === pendingAnchor)) return;
    requestAnimationFrame(() => {
      document.getElementById(pendingAnchor)?.scrollIntoView({ block: "center" });
      setPendingAnchor("");
    });
  }, [pendingAnchor, visibleEvents]);

  useLayoutEffect(() => {
    const preserve = preserveScrollRef.current;
    if (!preserve) return;
    const element = document.getElementById(preserve.id);
    if (element) window.scrollBy({ top: element.getBoundingClientRect().top - preserve.top });
    preserveScrollRef.current = null;
  }, [visibleStart, visibleEvents]);

  if (!session)
    return (
      <>
        <HistoryNavigation active="/sessions" />
        <EmptyState title="Session not available">
          This sample session is not part of the local fixture.{" "}
          <Link href="/sessions">Return to sessions.</Link>
        </EmptyState>
      </>
    );

  if (deleted)
    return (
      <>
        <HistoryNavigation active="/sessions" />
        <section
          className={styles.statusPanel + " " + styles.removed}
          data-testid="removed-history"
          aria-labelledby="removed-title"
        >
          <ShieldAlert size={22} aria-hidden="true" />
          <h2 id="removed-title">History removed</h2>
          <p>
            This sample session and its cached event content were removed from this browser. Related
            warning details are hidden, and old event links stop here.
          </p>
          <div className={styles.crossLinks}>
            <Link href="/sessions">
              View remaining sessions <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link href="/warnings">
              Open warning feed <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <SampleLabel />
        </section>
      </>
    );

  if (revoked)
    return (
      <>
        <HistoryNavigation active="/sessions" />
        <section
          className={styles.statusPanel + " " + styles.revoked}
          data-testid="access-revoked"
          aria-labelledby="revoked-title"
        >
          <ShieldAlert size={22} aria-hidden="true" />
          <h2 id="revoked-title">Access revoked</h2>
          <p>
            This sample review state hides the session while access is unavailable. It is separate
            from history that was deleted.
          </p>
          <button
            className={styles.featureButton}
            type="button"
            onClick={() => setSampleSessionAccessRevoked(id, false)}
          >
            Restore sample access
          </button>
        </section>
      </>
    );

  const isOwnSession = session.owner === currentOwner;
  const activeSession = session.id === "sample-sri";
  const eventsForCopy = visibleEvents
    .map((event) => event.role + ": " + event.content)
    .join("\n\n");

  function loadOlder() {
    const first = visibleEvents[0];
    if (first) {
      const element = document.getElementById(first.id);
      if (element)
        preserveScrollRef.current = { id: first.id, top: element.getBoundingClientRect().top };
    }
    atBottomRef.current = false;
    setNewEvents(false);
    setRequestedStart(Math.max(0, visibleStart - TRANSCRIPT_PAGE_SIZE));
  }

  function jumpToLatest() {
    setQuery("");
    setKind("all");
    setRequestedStart(null);
    setNewEvents(false);
    requestAnimationFrame(() => {
      const last = allEvents[allEvents.length - 1];
      if (last)
        document.getElementById(last.id)?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }

  function changeStreamStatus(status: StreamStatus) {
    const saved = setSampleStreamStatus(status);
    setActionMessage(
      saved
        ? streamStatusCopy(status)
        : "The sample stream state could not be saved in this browser.",
    );
  }

  function reconnect() {
    const result = reconnectSampleStream(id);
    if (!result) {
      setCatchupMessage(
        "Recovery is unavailable for this sample session or local browser storage.",
      );
      return;
    }
    setCatchupMessage(
      result.added
        ? "Recovered " +
            result.added +
            " sample event" +
            (result.added === 1 ? "" : "s") +
            " into saved browser history."
        : "No new events. " +
            result.duplicates +
            " repeated sample " +
            (result.duplicates === 1 ? "delivery was" : "deliveries were") +
            " deduplicated by stable event ID.",
    );
  }

  return (
    <>
      <Link href="/sessions" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" />
        All sessions
      </Link>
      <HistoryNavigation active="/sessions" />
      <div className="page-heading">
        <div>
          <div className="eyebrow">SAMPLE SESSION</div>
          <h1>{session.title}</h1>
          <p>
            {session.owner} + {session.agent}{" "}
            <span className="inline-branch">
              <GitBranch size={13} aria-hidden="true" />
              {session.branch}
            </span>
          </p>
          <p className="muted small">
            Last activity {formatActivityAge(session.lastActivityAt, sampleObservationAt(state))} at
            the {sampleObservationLabel(state)} sample snapshot.
          </p>
        </div>
      </div>
      <div className={styles.sampleBand}>
        <Info size={16} aria-hidden="true" />
        <span>
          Sample transcript only. No agent is connected and no new live activity is being received.
        </span>
      </div>
      <div className={styles.warningDetailGrid}>
        <section aria-label="Session transcript">
          <div className={styles.toolbar}>
            <label>
              <span className="sr-only">Search this sample transcript</span>
              <input
                type="search"
                placeholder="Find in this session…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setRequestedStart(null);
                }}
              />
            </label>
            <label>
              <span className="sr-only">Filter transcript event type</span>
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setRequestedStart(null);
                }}
              >
                <option value="all">All event types</option>
                <option value="user">User prompts</option>
                <option value="assistant">Agent responses</option>
                <option value="tool">Tool events</option>
              </select>
            </label>
          </div>
          <p className={styles.eventCount} role="status">
            {filteredEvents.length} matching sample events · ordered by observed time
          </p>
          {visibleStart > 0 && (
            <div className={styles.pagination}>
              <button className={styles.featureButton} type="button" onClick={loadOlder}>
                Load older events
              </button>
              <span>
                Showing {visibleStart + 1}–
                {Math.min(visibleStart + TRANSCRIPT_PAGE_SIZE, filteredEvents.length)} of{" "}
                {filteredEvents.length}
              </span>
            </div>
          )}
          <div className={styles.eventScroller}>
            {visibleEvents.map((event) => (
              <EventCard key={event.id} event={event} owner={session.owner} agent={session.agent} />
            ))}
          </div>
          {!visibleEvents.length && (
            <EmptyState title="No events found">
              Change the search or event-type filter to see more.
            </EmptyState>
          )}
          {newEvents && (
            <div className={styles.newEvents}>
              <button type="button" onClick={jumpToLatest}>
                New sample events · Jump to latest
              </button>
            </div>
          )}
          <div className="section-spacing">
            <div className={styles.streamPanel}>
              <span
                className={
                  styles.streamStatus +
                  (state.streamStatus === "connected" ? "" : " " + styles[state.streamStatus])
                }
              >
                Sample stream · {state.streamStatus}
              </span>
              <h2>Recover missed sample activity</h2>
              <p>
                {streamStatusCopy(state.streamStatus)} Reconnect reads this fixture’s persisted
                catch-up batch and deduplicates its stable IDs.
              </p>
              <div className={styles.buttonRow}>
                <button className={styles.featureButton} type="button" onClick={reconnect}>
                  Reconnect and catch up
                </button>
              </div>
              {catchupMessage && (
                <p role="status" data-testid="catchup-result">
                  {catchupMessage}
                </p>
              )}
              {actionMessage && <p role="status">{actionMessage}</p>}
              <details className={styles.reviewDisclosure}>
                <summary>Sample lab controls</summary>
                <div className={styles.reviewDisclosureContent}>
                  <fieldset>
                    <legend>Persisted fixture state</legend>
                    {(
                      [
                        ["connected", "Ready"],
                        ["paused", "Paused"],
                        ["unavailable", "Unavailable"],
                      ] as const
                    ).map(([value, label]) => (
                      <label className={styles.radioChoice} key={value}>
                        <input
                          type="radio"
                          name="sample-stream-state"
                          value={value}
                          checked={state.streamStatus === value}
                          onChange={() => changeStreamStatus(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <p>These controls change only the sample fixture saved in this browser.</p>
                  <button
                    className={styles.featureButton}
                    type="button"
                    onClick={() => setSampleSessionAccessRevoked(id, true)}
                  >
                    Simulate access revoked
                  </button>
                </div>
              </details>
            </div>
          </div>
          {isOwnSession && (
            <section className={styles.deletePanel} aria-labelledby="delete-heading">
              <h2 id="delete-heading">Remove your sample history</h2>
              <p>
                {activeSession
                  ? "This sample session is protected from automatic cleanup while active. You can still manually delete your own stored copy."
                  : "Manual deletion removes your stored sample transcript and hides linked warning context."}{" "}
                The original local agent conversation and repository files are unaffected.
              </p>
              {!confirmDelete ? (
                <button
                  className={styles.dangerButton}
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Delete my sample session
                </button>
              ) : (
                <div role="group" aria-label="Confirm sample history deletion">
                  <p>
                    This deletes “{session.title}” from this browser and hides warning details that
                    cite it.
                  </p>
                  <div className={styles.buttonRow}>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => {
                        const removed = deleteOwnSampleSession(id, currentOwner);
                        if (!removed)
                          setActionMessage(
                            "History could not be removed. Check browser storage access and try again.",
                          );
                        setConfirmDelete(false);
                      }}
                    >
                      Confirm deletion
                    </button>
                    <button
                      className={styles.featureButton}
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </section>
        <aside className="detail-aside">
          <h2>Session context</h2>
          <dl>
            <dt>Sharing</dt>
            <dd>
              {sharingForMember(controls, session.owner.toLowerCase()).privateSessions.includes(id)
                ? "Private for future capture"
                : sharingForMember(controls, session.owner.toLowerCase()).sharingPaused
                  ? "Future sample sharing paused"
                  : sharingForMember(controls, session.owner.toLowerCase()).sharingEnabled
                    ? "Future sample sharing enabled"
                    : "Future sample sharing off"}
              . Stored sample history remains visible.
            </dd>
            <dt>Capture</dt>
            <dd>{session.captureNote}</dd>
            <dt>Repository</dt>
            <dd>{session.repository}</dd>
            <dt>Scope</dt>
            <dd>{session.scope}</dd>
            <dt>Files</dt>
            <dd>
              {session.files.map((file) => (
                <code className="file-tag" key={file}>
                  {file}
                </code>
              ))}
            </dd>
          </dl>
          <CopyButton value={eventsForCopy} label="Copy visible transcript" />
          <p className={styles.fixtureFootnote}>
            Stable event anchors open the correct page even when an older event is outside the
            newest page.
          </p>
          <div className={styles.crossLinks}>
            <Link href="/warnings">
              Warnings <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link href="/storage">
              History & storage <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}

function EventCard({ event, owner, agent }: { event: HistoryEvent; owner: Builder; agent: Agent }) {
  const icon =
    event.role === "tool" ? (
      <FileCode2 size={17} aria-hidden="true" />
    ) : event.role === "assistant" ? (
      <Bot size={17} aria-hidden="true" />
    ) : (
      <Avatar name={owner} small />
    );
  const name =
    event.role === "tool" ? "Sample tool activity" : event.role === "assistant" ? agent : owner;
  return (
    <article className={styles.eventCard} id={event.id} data-history-event={event.id}>
      <header className={styles.eventHeader}>
        {icon}
        <strong>{name}</strong>
        <time dateTime={event.occurredAt}>{event.time}</time>
        <a
          className={styles.eventAnchor}
          href={"#" + event.id}
          aria-label={"Link to " + event.title}
        >
          #
        </a>
      </header>
      {event.role === "tool" ? (
        <details>
          <summary className={styles.toolSummary}>
            {event.title} · {event.status}
          </summary>
          <div className={styles.eventBody}>
            <pre>
              <code>{event.content}</code>
            </pre>
          </div>
        </details>
      ) : (
        <div className={styles.eventBody}>
          <strong>{event.title}</strong>
          <p>{event.content}</p>
        </div>
      )}
      <div className={styles.eventMeta}>
        <span className={styles.marker}>Sample fixture event</span>
        {event.role === "tool" && <span className={styles.marker}>Status: {event.status}</span>}
        {event.redacted && <span className={styles.marker}>Redacted excerpt</span>}
        {event.truncated && (
          <span className={styles.marker + " " + styles.warning}>
            Truncated · remaining output omitted
          </span>
        )}
      </div>
    </article>
  );
}
