"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Avatar, CopyButton, MemberAvatar } from "@/components/ui";
import { sampleSessions, filterSessions, formatActivityAge } from "../workspace/session-model";
import {
  eventAnchorPageStart,
  getSampleHistoryEvents,
  sampleObservationAt,
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
import styles from "./transcript.module.css";
import { sharingForMember, useWorkspaceControls } from "../workspace-controls/store";

const streamLabels: Record<StreamStatus, string> = {
  connected: "Stream connected",
  paused: "Stream paused",
  unavailable: "Stream unavailable",
};

export function Sessions() {
  const { state } = useSampleHistory();
  const [query, setQuery] = useState("");
  // filterSessions returns every teammate's sessions, newest activity first.
  const sessions = filterSessions(visibleSampleSessions(state), {
    builder: "all",
    agent: "all",
    query,
  });
  const asOf = sampleObservationAt(state);

  return (
    <>
      <div className={styles.listHeader}>
        <h1>Sessions</h1>
        <input
          className={styles.search}
          type="search"
          aria-label="Search sessions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search…"
        />
      </div>
      <div className={styles.list}>
        {sessions.map((session) => (
          <Link className={styles.row} key={session.id} href={"/sessions/" + session.id}>
            <Avatar name={session.owner} small />
            <div>
              <h2>{session.title}</h2>
              <p>
                {session.owner} · {session.agent} · {session.branch}
              </p>
            </div>
            <time dateTime={session.lastActivityAt}>
              {formatActivityAge(session.lastActivityAt, asOf)}
            </time>
          </Link>
        ))}
      </div>
      {!sessions.length && (
        <p className={styles.empty}>{query ? "No matching sessions." : "No sessions yet."}</p>
      )}
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
  const menuRef = useRef<HTMLDetailsElement>(null);

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
    const closeMenu = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

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

  const backLink = (
    <Link href="/sessions" className={styles.back}>
      <ArrowLeft size={14} aria-hidden="true" />
      Sessions
    </Link>
  );

  if (!session)
    return (
      <div className={styles.page}>
        {backLink}
        <section className={styles.statePanel}>
          <h1>Session not found</h1>
          <Link href="/sessions">Back to sessions</Link>
        </section>
      </div>
    );

  if (deleted)
    return (
      <div className={styles.page}>
        {backLink}
        <section
          className={styles.statePanel}
          data-testid="removed-history"
          aria-labelledby="removed-title"
        >
          <h2 id="removed-title">History removed</h2>
          <p>This session was deleted. Old links to it end here.</p>
        </section>
      </div>
    );

  if (revoked)
    return (
      <div className={styles.page}>
        {backLink}
        <section
          className={styles.statePanel}
          data-testid="access-revoked"
          aria-labelledby="revoked-title"
        >
          <h2 id="revoked-title">Access revoked</h2>
          <p>You no longer have access to this session.</p>
          <button
            className={styles.textButton}
            type="button"
            onClick={() => setSampleSessionAccessRevoked(id, false)}
          >
            Restore sample access
          </button>
        </section>
      </div>
    );

  const isOwnSession = session.owner === currentOwner;
  const sharing = sharingForMember(controls, session.owner.toLowerCase());
  const sharingLabel = sharing.privateSessions.includes(id)
    ? "Private"
    : sharing.sharingPaused
      ? "Paused"
      : sharing.sharingEnabled
        ? "On"
        : "Off";
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
    setActionMessage(saved ? "" : "Could not save the stream state in this browser.");
  }

  function reconnect() {
    const result = reconnectSampleStream(id);
    if (!result) {
      setCatchupMessage("Reconnect is unavailable.");
      return;
    }
    setCatchupMessage(
      result.added
        ? "Recovered " + result.added + " event" + (result.added === 1 ? "" : "s") + "."
        : "No new events. Skipped " +
            result.duplicates +
            " duplicate" +
            (result.duplicates === 1 ? "" : "s") +
            ".",
    );
  }

  const observedAt = sampleObservationAt(state);
  const ownerMember = controls.members.find((member) => member.name === session.owner);
  const otherSessions = visibleSampleSessions(state).filter(
    (item) => item.owner === session.owner && item.id !== id,
  );

  return (
    <div className={styles.detailLayout}>
      <div className={styles.page}>
        {backLink}
        <header className={styles.header}>
          <div>
            <h1>{session.title}</h1>
            <p className={styles.meta}>
              {session.owner} · {session.agent} · {session.branch} ·{" "}
              {formatActivityAge(session.lastActivityAt, sampleObservationAt(state))}
            </p>
          </div>
          <div className={styles.tools}>
            <input
              className={styles.search}
              type="search"
              aria-label="Search this session"
              placeholder="Find…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRequestedStart(null);
              }}
            />
            <select
              className={styles.select}
              aria-label="Filter transcript event type"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setRequestedStart(null);
              }}
            >
              <option value="all">All</option>
              <option value="user">Prompts</option>
              <option value="assistant">Responses</option>
              <option value="tool">Tools</option>
            </select>
            <details className={styles.menu} ref={menuRef}>
              <summary aria-label="Session menu">
                <MoreHorizontal size={16} aria-hidden="true" />
              </summary>
              <div className={styles.menuPanel}>
                <dl>
                  <dt>Repository</dt>
                  <dd>{session.repository}</dd>
                  <dt>Sharing</dt>
                  <dd>{sharingLabel}</dd>
                  <dt>Files</dt>
                  <dd>{session.files.join(", ")}</dd>
                </dl>
                <CopyButton value={eventsForCopy} label="Copy transcript" />
                <div className={styles.menuDivider} />
                <details>
                  <summary>Sample lab controls</summary>
                  <fieldset>
                    <legend>Stream state</legend>
                    {(
                      [
                        ["connected", "Ready"],
                        ["paused", "Paused"],
                        ["unavailable", "Unavailable"],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="sample-stream-state"
                          value={value}
                          checked={state.streamStatus === value}
                          onChange={() => changeStreamStatus(value)}
                        />{" "}
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => setSampleSessionAccessRevoked(id, true)}
                  >
                    Simulate access revoked
                  </button>
                </details>
                {isOwnSession &&
                  (!confirmDelete ? (
                    <button
                      className={styles.textButton + " " + styles.danger}
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete my sample session
                    </button>
                  ) : (
                    <div role="group" aria-label="Confirm deletion">
                      <p>Delete this session and hide warnings that cite it?</p>
                      <div className={styles.confirmRow}>
                        <button
                          className={styles.textButton + " " + styles.danger}
                          type="button"
                          onClick={() => {
                            const removed = deleteOwnSampleSession(id, currentOwner);
                            if (!removed) setActionMessage("Could not delete. Try again.");
                            setConfirmDelete(false);
                          }}
                        >
                          Confirm deletion
                        </button>
                        <button
                          className={styles.textButton}
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </details>
          </div>
        </header>

        <section className={styles.transcript} aria-label="Session transcript">
          {visibleStart > 0 && (
            <button className={styles.older} type="button" onClick={loadOlder}>
              Load older events
            </button>
          )}
          {visibleEvents.map((event) => (
            <TranscriptEvent key={event.id} event={event} />
          ))}
          {!visibleEvents.length && <p className={styles.empty}>No matching events.</p>}
          {newEvents && (
            <button className={styles.jump} type="button" onClick={jumpToLatest}>
              Jump to latest ↓
            </button>
          )}
        </section>

        <footer className={styles.statusBar}>
          <span>
            <span
              className={
                styles.streamDot +
                (state.streamStatus === "connected" ? "" : " " + styles[state.streamStatus])
              }
              aria-hidden="true"
            />
            {streamLabels[state.streamStatus]}
          </span>
          <button className={styles.textButton} type="button" onClick={reconnect}>
            Reconnect
          </button>
          {catchupMessage && (
            <span role="status" data-testid="catchup-result">
              {catchupMessage}
            </span>
          )}
          {actionMessage && <span role="status">{actionMessage}</span>}
        </footer>
      </div>
      <aside className={styles.owner} aria-label={session.owner + "’s profile"}>
        <MemberAvatar
          id={ownerMember?.id ?? session.owner.toLowerCase()}
          name={session.owner}
          githubLogin={ownerMember?.githubLogin}
        />
        <h2>{session.owner}</h2>
        <p className={styles.ownerActive}>
          Last active {formatActivityAge(session.lastActivityAt, observedAt).toLowerCase()}
        </p>
        <h3>Other sessions</h3>
        {otherSessions.length ? (
          <ul className={styles.ownerSessions}>
            {otherSessions.map((item) => (
              <li key={item.id}>
                <Link href={"/sessions/" + item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.branch} · {formatActivityAge(item.lastActivityAt, observedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.ownerEmpty}>No other sessions from {session.owner} yet.</p>
        )}
      </aside>
    </div>
  );
}

function toolSummary(event: HistoryEvent) {
  try {
    const data: unknown = JSON.parse(event.content);
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const paths = Array.isArray(record.relative_paths)
        ? record.relative_paths.filter((path): path is string => typeof path === "string")
        : typeof record.relative_path === "string"
          ? [record.relative_path]
          : typeof record.command === "string"
            ? [record.command]
            : [];
      return {
        name: typeof record.tool_name === "string" ? record.tool_name : "Tool",
        input: paths.join(", ") || event.file || "",
        output: typeof record.result_excerpt === "string" ? record.result_excerpt : "",
      };
    }
  } catch {
    // Non-JSON tool content is shown as plain output below.
  }
  return { name: "Tool", input: event.file ?? "", output: event.content };
}

function TranscriptEvent({ event }: { event: HistoryEvent }) {
  const anchor = (
    <a className={styles.anchor} href={"#" + event.id} aria-label={"Link to " + event.title}>
      <time dateTime={event.occurredAt}>{event.time}</time>
    </a>
  );

  if (event.role === "user")
    return (
      <article className={styles.event} id={event.id} data-history-event={event.id}>
        {anchor}
        <div className={styles.user}>{event.content}</div>
      </article>
    );

  if (event.role === "assistant")
    return (
      <article className={styles.event} id={event.id} data-history-event={event.id}>
        {anchor}
        <div className={styles.reply}>
          <div className={styles.text}>{event.content}</div>
          {event.truncated && <div className={styles.truncated}>Output truncated</div>}
        </div>
      </article>
    );

  const tool = toolSummary(event);
  const statusClass =
    event.status === "error"
      ? styles.stepError
      : event.status === "running"
        ? styles.stepRunning
        : styles.stepSuccess;
  return (
    <article className={styles.event} id={event.id} data-history-event={event.id}>
      {anchor}
      <details className={styles.step + " " + statusClass + " " + styles.tool}>
        <summary>
          <span className={styles.toolName}>{tool.name}</span>
          <span className={styles.toolTarget}>{tool.input}</span>
          {event.redacted && <span className={styles.tag}>redacted</span>}
          {event.truncated && <span className={styles.tag}>truncated</span>}
        </summary>
        <div className={styles.ioBlock}>
          {tool.input && (
            <>
              <span>IN</span>
              <pre>{tool.input}</pre>
            </>
          )}
          <span>OUT</span>
          <pre>{tool.output || "(no output)"}</pre>
        </div>
      </details>
    </article>
  );
}
