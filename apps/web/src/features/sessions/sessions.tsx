"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Bot, FileCode2, GitBranch, Search } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Avatar, CopyButton, EmptyState } from "@/components/ui";
import { sampleEvents } from "@/lib/sample-data";
import {
  filterSessions,
  formatActivityAge,
  SAMPLE_SNAPSHOT_AT,
  sampleSessions,
} from "../workspace/session-model";

export function Sessions() {
  const [query, setQuery] = useState("");
  const sessions = filterSessions(sampleSessions, { builder: "all", agent: "all", query });
  return (
    <>
      <div className="page-heading">
        <div className="heading-copy">
          <div className="eyebrow">SHARED, WITH INTENT</div>
          <h1>Sessions</h1>
          <p>A window into the work. Only the conversations you choose to share.</p>
        </div>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search sessions</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search builder, prompt, project, or branch…"
          />
        </label>
        <span className="muted small">{sessions.length} sample sessions</span>
      </div>
      <div className="session-list">
        {sessions.map((session) => (
          <Link className="session-row" key={session.id} href={`/sessions/${session.id}`}>
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
                Last activity {formatActivityAge(session.lastActivityAt, SAMPLE_SNAPSHOT_AT)} at the
                Oct 3, 2026 · 10:40 PDT sample snapshot.
              </p>
            </div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ))}
      </div>
      {!sessions.length && (
        <EmptyState title="No matching sessions">
          Try another builder, agent, prompt, project, or branch.
        </EmptyState>
      )}
      <p className="understated-note">
        All sessions here are sample history. Real capture and cross-client streaming are the next
        integration gate.
      </p>
    </>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const { state } = useWorkspace();
  const session = sampleSessions.find((session) => session.id === id);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  if (!session)
    return (
      <EmptyState title="Session not available">
        This sample session may have been reset. <Link href="/sessions">Return to sessions.</Link>
      </EmptyState>
    );
  const normalizedQuery = query.trim().toLowerCase();
  const events = sampleEvents.filter(
    (event) =>
      event.sessionId === id &&
      (kind === "all" || event.role === kind) &&
      `${event.title} ${event.content}`.toLowerCase().includes(normalizedQuery),
  );
  return (
    <>
      <Link href="/sessions" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" />
        All sessions
      </Link>
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
            Last activity {formatActivityAge(session.lastActivityAt, SAMPLE_SNAPSHOT_AT)} at the Oct
            3, 2026 · 10:40 PDT sample snapshot.
          </p>
        </div>
      </div>
      <div className="detail-grid">
        <section aria-label="Session transcript">
          <div className="toolbar">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search transcript</span>
              <input
                type="search"
                placeholder="Find in this session…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="sr-only" htmlFor="event-filter">
              Event type
            </label>
            <select id="event-filter" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All events</option>
              <option value="user">User prompts</option>
              <option value="assistant">Agent responses</option>
              <option value="tool">Tool events</option>
            </select>
          </div>
          <p className="muted small" role="status">
            {events.length} matching sample events · Snapshot from Oct 3, 2026
          </p>
          <div className="transcript">
            {events.map((event) => (
              <article
                className={`transcript-event event-${event.role}`}
                id={event.id}
                key={event.id}
              >
                <div className="event-heading">
                  {event.role === "assistant" ? (
                    <Bot size={18} aria-hidden="true" />
                  ) : event.role === "tool" ? (
                    <FileCode2 size={18} aria-hidden="true" />
                  ) : (
                    <Avatar name={session.owner} small />
                  )}
                  <strong>
                    {event.role === "assistant"
                      ? session.agent
                      : event.role === "tool"
                        ? "Sample tool activity"
                        : session.owner}
                  </strong>
                  <span>{event.time}</span>
                  <a href={`#${event.id}`} aria-label={`Link to ${event.title}`}>
                    #
                  </a>
                </div>
                {event.role === "tool" ? (
                  <details>
                    <summary>{event.title}</summary>
                    <pre>
                      <code>{event.content}</code>
                    </pre>
                    <span className="fixture-label">
                      Sanitized sample · tool result excerpt only
                    </span>
                  </details>
                ) : (
                  <p className="message-content">{event.content}</p>
                )}
              </article>
            ))}
          </div>
          {!events.length && (
            <EmptyState title="No events found">
              Change the search or event filter to see more.
            </EmptyState>
          )}
        </section>
        <aside className="detail-aside">
          <h2>Session context</h2>
          <dl>
            <dt>Sharing</dt>
            <dd>{state.sharingPaused ? "Sample sharing paused" : "Sample history only"}</dd>
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
          <CopyButton
            value={events.map((event) => `${event.role}: ${event.content}`).join("\n\n")}
            label="Copy visible transcript"
          />
        </aside>
      </div>
    </>
  );
}
