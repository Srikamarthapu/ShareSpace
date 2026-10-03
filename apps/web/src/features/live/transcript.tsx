"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { AGENT_LABELS, type EventRow, type SessionRow } from "@workspace/core";
import type { WorkspaceData } from "./data";
import { SessionMarkdown } from "@/features/sessions/markdown";
import styles from "@/features/sessions/transcript.module.css";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}
function ownerName(data: WorkspaceData, id: string) {
  return data.members.find((member) => member.user_id === id)?.display_name ?? "Former member";
}
function eventText(event: EventRow) {
  if (event.kind === "user.message" || event.kind === "assistant.message")
    return event.payload.text;
  if (event.kind === "tool.started")
    return `${event.payload.tool_name}\n${event.payload.relative_paths.join(", ")}\n${event.payload.input_excerpt ?? ""}`;
  if (event.kind === "tool.completed")
    return `${event.payload.tool_name}\n${event.payload.relative_paths.join(", ")}\n${event.payload.output_excerpt ?? ""}`;
  return event.kind === "session.started" ? "Session started" : "Session ended";
}
function Copy({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  return (
    <div>
      <button
        className={styles.textButton}
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Copied.");
          } catch {
            setStatus("Copy unavailable. Select the transcript text to copy it.");
          }
        }}
      >
        {label}
      </button>
      {status && (
        <span className="muted small" role="status">
          {" "}
          {status}
        </span>
      )}
    </div>
  );
}
function TranscriptEvent({ event }: { event: EventRow }) {
  const anchor = (
    <a
      className={styles.anchor}
      href={`#event-${event.id}`}
      aria-label={`Link to event ${event.sequence}`}
    >
      <time dateTime={event.occurred_at}>
        {new Date(event.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>
    </a>
  );
  const annotations = (
    <>
      {event.redacted && <span className={styles.tag}>redacted</span>}
      {event.truncated && <span className={styles.tag}>truncated</span>}
    </>
  );
  return (
    <article className={styles.event} id={`event-${event.id}`}>
      {anchor}
      {event.kind === "user.message" ? (
        <div className={styles.user}>
          <div className={styles.markdown}>
            <SessionMarkdown text={event.payload.text} />
          </div>
          {annotations}
        </div>
      ) : event.kind === "assistant.message" ? (
        <div className={styles.reply}>
          <div className={styles.markdown}>
            <SessionMarkdown text={event.payload.text} />
          </div>
          {annotations}
        </div>
      ) : event.kind === "tool.started" || event.kind === "tool.completed" ? (
        <details
          className={`${styles.step} ${event.kind === "tool.started" ? styles.stepRunning : event.payload.status === "error" ? styles.stepError : styles.stepSuccess} ${styles.tool}`}
        >
          <summary>
            <span className={styles.toolName}>{event.payload.tool_name}</span>
            <span className={styles.toolTarget}>{event.payload.relative_paths.join(", ")}</span>
            {event.kind === "tool.completed" && (
              <span className={styles.tag}>{event.payload.status}</span>
            )}
            {annotations}
          </summary>
          <div className={styles.ioBlock}>
            <span>{event.kind === "tool.started" ? "IN" : "OUT"}</span>
            <pre>
              {event.kind === "tool.started"
                ? (event.payload.input_excerpt ?? "No input excerpt shared.")
                : (event.payload.output_excerpt ?? "No output excerpt shared.")}
            </pre>
          </div>
        </details>
      ) : (
        <p className="muted small">{eventText(event)}</p>
      )}
    </article>
  );
}
export function LiveSessions({ data }: { data: WorkspaceData }) {
  const [query, setQuery] = useState("");
  const sessions = data.sessions.filter((session) =>
    `${session.title} ${session.branch} ${session.latest_prompt}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
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
          <Link
            className={styles.row}
            key={session.id}
            href={`/live?view=sessions&session=${session.id}`}
          >
            <span className="avatar avatar-small" aria-hidden="true">
              {ownerName(data, session.user_id).slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h2>{session.title ?? "Untitled session"}</h2>
              <p>
                {ownerName(data, session.user_id)} · {AGENT_LABELS[session.agent]} ·{" "}
                {session.branch ?? "Branch unavailable"}
                {session.history_removed_at ? " · History removed" : ""}
              </p>
            </div>
            <time dateTime={session.last_activity_at}>
              {new Date(session.last_activity_at).toLocaleDateString()}
            </time>
          </Link>
        ))}
      </div>
      {!sessions.length && (
        <p className={styles.empty}>
          {query ? (
            "No matching sessions."
          ) : (
            <>
              No sessions yet. <Link href="/live?view=guide">Connect an agent</Link> and enable
              sharing to start.
            </>
          )}
        </p>
      )}
    </>
  );
}
export function LiveTranscript({
  data,
  session,
  userId,
  pending,
  eventLimit,
  onLoadEarlier,
  onVisibility,
  onDelete,
  connection,
  refresh,
}: {
  data: WorkspaceData;
  session: SessionRow;
  userId: string;
  pending: boolean;
  eventLimit: number;
  onLoadEarlier: () => void;
  onVisibility: () => void;
  onDelete: () => Promise<void>;
  connection: string;
  refresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const events = data.events.filter(
    (event) =>
      (kind === "all" || event.kind.startsWith(kind)) &&
      eventText(event).toLowerCase().includes(query.toLowerCase()),
  );
  const name = ownerName(data, session.user_id);
  const otherSessions = data.sessions.filter(
    (item) => item.user_id === session.user_id && item.id !== session.id,
  );
  return (
    <div className={styles.detailLayout}>
      <div className={styles.page}>
        <Link href="/live?view=sessions" className={styles.back}>
          <ArrowLeft size={14} aria-hidden="true" />
          Sessions
        </Link>
        <header className={styles.header}>
          <div>
            <h1>{session.title ?? "Untitled session"}</h1>
            <p className={styles.meta}>
              {name} · {AGENT_LABELS[session.agent]} · {session.branch ?? "Branch unavailable"}
            </p>
          </div>
          <div className={styles.tools}>
            <input
              className={styles.search}
              type="search"
              aria-label="Search this session"
              placeholder="Find…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className={styles.select}
              aria-label="Filter transcript event type"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">All</option>
              <option value="user.">Prompts</option>
              <option value="assistant.">Responses</option>
              <option value="tool.">Tools</option>
            </select>
            <details className={styles.menu}>
              <summary aria-label="Session menu">
                <MoreHorizontal size={16} aria-hidden="true" />
              </summary>
              <div className={styles.menuPanel}>
                <dl>
                  <dt>Repository</dt>
                  <dd>
                    {data.repositories.find((repository) => repository.id === session.repository_id)
                      ?.name ?? "Unavailable"}
                  </dd>
                  <dt>Sharing</dt>
                  <dd>{session.visibility}</dd>
                  <dt>Events</dt>
                  <dd>{session.event_count}</dd>
                  <dt>Status</dt>
                  <dd>{session.ended_at ? "Ended" : "Active"}</dd>
                </dl>
                <Copy
                  value={events.map((event) => `${event.kind}: ${eventText(event)}`).join("\n\n")}
                  label="Copy transcript"
                />
                {session.capture_limitations.length > 0 && (
                  <p className="muted">
                    Capture limitations: {session.capture_limitations.join(" · ")}
                  </p>
                )}
                {session.user_id === userId && !session.history_removed_at && (
                  <>
                    <div className={styles.menuDivider} />
                    <button
                      className={styles.textButton}
                      type="button"
                      disabled={pending}
                      onClick={onVisibility}
                    >
                      {session.visibility === "shared" ? "Make private" : "Share session"}
                    </button>
                    {!confirmDelete ? (
                      <button
                        className={`${styles.textButton} ${styles.danger}`}
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete shared history
                      </button>
                    ) : (
                      <div role="group" aria-label="Confirm deletion">
                        <p>
                          Delete shared events and related warning excerpts for everyone? This
                          cannot be undone.
                        </p>
                        <div className={styles.confirmRow}>
                          <button
                            className={`${styles.textButton} ${styles.danger}`}
                            type="button"
                            disabled={pending}
                            onClick={async () => {
                              await onDelete();
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
                    )}
                  </>
                )}
              </div>
            </details>
          </div>
        </header>
        {session.history_removed_at ? (
          <section className={styles.statePanel}>
            <h2>History removed</h2>
            <p>
              {session.history_removed_reason === "owner_deleted"
                ? "The owner deleted this history."
                : "Older history was removed to stay within storage limits."}
            </p>
          </section>
        ) : (
          <section className={styles.transcript} aria-label="Session transcript">
            {session.event_count > data.events.length && (
              <button
                className={styles.older}
                type="button"
                disabled={eventLimit >= 1000}
                onClick={onLoadEarlier}
              >
                {eventLimit >= 1000 ? "Showing the latest 1,000 events" : "Load older events"}
              </button>
            )}
            {events.map((event) => (
              <TranscriptEvent key={event.id} event={event} />
            ))}
            {!events.length && (
              <p className={styles.empty}>
                {query || kind !== "all" ? "No matching events." : "No shared events yet."}
              </p>
            )}
          </section>
        )}
        <footer className={styles.statusBar}>
          <span>{connection}</span>
          <button className={styles.textButton} type="button" onClick={refresh}>
            Refresh
          </button>
          <span>Read-only shared transcript</span>
        </footer>
      </div>
      <aside className={styles.owner} aria-label={`${name}’s profile`}>
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <h2>{name}</h2>
        <p className={styles.ownerActive}>Last active {when(session.last_activity_at)}</p>
        <h3>Other sessions</h3>
        {otherSessions.length ? (
          <ul className={styles.ownerSessions}>
            {otherSessions.map((item) => (
              <li key={item.id}>
                <Link href={`/live?view=sessions&session=${item.id}`}>
                  <strong>{item.title ?? "Untitled session"}</strong>
                  <span>{item.branch ?? "Branch unavailable"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.ownerEmpty}>No other sessions yet.</p>
        )}
      </aside>
    </div>
  );
}
