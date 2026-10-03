"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, GitBranch, Info, Plus, Search } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Avatar, EmptyState } from "@/components/ui";
import { sampleEvents } from "@/lib/sample-data";
import {
  filterSessions,
  formatActivityAge,
  sampleSessions,
  SAMPLE_SNAPSHOT_AT,
  type SessionFilters,
} from "./session-model";

const initialFilters: SessionFilters = { builder: "all", agent: "all", query: "" };

export function Overview() {
  const { state } = useWorkspace();
  const [filters, setFilters] = useState<SessionFilters>(initialFilters);
  const sessions = filterSessions(sampleSessions, filters);
  const hasFilters = filters.builder !== "all" || filters.agent !== "all" || filters.query !== "";
  const visibleIds = new Set(sessions.map((session) => session.id));
  const recentEvents = sampleEvents
    .filter((event) => visibleIds.has(event.sessionId))
    .slice(-4)
    .reverse();

  return (
    <div className="session-dashboard">
      <div className="page-heading">
        <div>
          <h1>Workspace</h1>
          <p>Shared sessions. A little context before your next change.</p>
        </div>
        <Link className="button button-primary" href="/connect">
          <Plus size={16} aria-hidden="true" />
          Connect agent
        </Link>
      </div>

      <section className="dashboard-sessions" aria-labelledby="shared-sessions-heading">
        <div className="section-heading">
          <h2 id="shared-sessions-heading">
            Shared sessions <span className="count">{sampleSessions.length}</span>
          </h2>
          <span className="snapshot-label">
            Sample snapshot <time dateTime={SAMPLE_SNAPSHOT_AT}>Oct 3 · 10:40 PDT</time>
          </span>
        </div>
        {state.sharingPaused && (
          <p className="dashboard-notice" role="status">
            <Info size={16} aria-hidden="true" />
            Sample sharing is paused. Existing history remains visible.
          </p>
        )}
        <div className="session-filters">
          <div className="filter-row" role="group" aria-label="Filter sessions by builder">
            {(["all", "Sam", "Sri"] as const).map((builder) => (
              <button
                key={builder}
                type="button"
                aria-pressed={filters.builder === builder}
                className={`filter ${filters.builder === builder ? "selected" : ""}`}
                onClick={() => setFilters({ ...filters, builder })}
              >
                {builder === "all" ? "Everyone" : builder}
              </button>
            ))}
          </div>
          <div className="session-agent-filter">
            <label className="sr-only" htmlFor="session-agent">
              Agent
            </label>
            <select
              id="session-agent"
              value={filters.agent}
              onChange={(event) =>
                setFilters({ ...filters, agent: event.target.value as SessionFilters["agent"] })
              }
            >
              <option value="all">All agents</option>
              <option value="Claude Code">Claude Code</option>
              <option value="Codex">Codex</option>
            </select>
          </div>
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search shared sessions</span>
            <input
              type="search"
              placeholder="Search sessions…"
              value={filters.query}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            />
          </label>
        </div>
        <div className="session-list-status">
          <span role="status">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            {hasFilters ? " match your filters" : " · Most recent first"}
          </span>
          {hasFilters && (
            <button
              type="button"
              className="reset-filters"
              onClick={() => setFilters(initialFilters)}
            >
              Reset filters
            </button>
          )}
        </div>
        <div className="shared-session-list">
          {sessions.map((session) => (
            <article
              className="shared-session-row"
              key={session.id}
              aria-label={`${session.owner}’s session`}
            >
              <div className="session-person">
                <Avatar name={session.owner} />
                <div>
                  <strong>{session.owner}</strong>
                  <span>{session.agent}</span>
                </div>
              </div>
              <div className="session-row-content">
                <h3>
                  <Link
                    href={`/sessions/${session.id}`}
                  >
                    {session.title}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </h3>
                <p className="session-prompt">
                  <span className="sr-only">Latest shared prompt: </span>
                  {session.latestPrompt}
                </p>
                <span className="session-branch">
                  <GitBranch size={13} aria-hidden="true" />
                  <code>{session.branch}</code>
                </span>
              </div>
              <div className="session-row-meta">
                <time dateTime={session.lastActivityAt} title="Relative to the sample snapshot">
                  {formatActivityAge(session.lastActivityAt, SAMPLE_SNAPSHOT_AT)}
                </time>
                <span className="sr-only">at the sample snapshot</span>
                <span className="session-sharing">
                  {state.sharingPaused ? "Sample · paused" : "Sample · shared"}
                </span>
              </div>
            </article>
          ))}
        </div>
        {sessions.length === 0 && (
          <EmptyState title="No matching sessions">
            Try a different builder, agent, or search, or reset your filters.
          </EmptyState>
        )}
      </section>

      <section className="overlap-notice" aria-labelledby="overlap-heading">
        <Info size={18} aria-hidden="true" />
        <div>
          <div className="overlap-notice-heading">
            <h2 id="overlap-heading">Possible overlap in saved-college storage</h2>
            <span>Sample advisory</span>
          </div>
          <p>
            Sam’s API and Sri’s shortlist both mention persistence. Check the shared intent before
            building the same thing twice.
          </p>
          <div className="overlap-links">
            <Link href="/sessions/sample-sam#sam-request">
              Sam’s prompt
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
            <Link href="/sessions/sample-sri#sri-request">
              Sri’s prompt
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
            <span>Advisory only. Work can continue.</span>
          </div>
        </div>
      </section>

      <section className="activity-section" aria-labelledby="activity-heading">
        <div className="section-heading">
          <h2 id="activity-heading">Recent activity</h2>
          <Link href="/sessions" className="text-link">
            All history
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {recentEvents.length ? (
          <ol className="activity-list">
            {recentEvents.map((event) => (
              <li key={event.id}>
                <time dateTime={`2026-10-03T${event.time}:00-07:00`}>{event.time}</time>
                <span className="activity-person">
                  {event.sessionId === "sample-sam" ? "Sam" : "Sri"}
                </span>
                <div>
                  <Link href={`/sessions/${event.sessionId}#${event.id}`}>{event.title}</Link>
                  <p>
                    {event.file ??
                      (event.sessionId === "sample-sam"
                        ? "Saved-college API"
                        : "Personal shortlist")}
                  </p>
                </div>
                <span className="activity-kind">
                  {event.role === "tool" ? "Tool event" : "Message"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="activity-empty">No activity matches these filters.</p>
        )}
      </section>
      <p className="analysis-status">
        <span className="status-dot" aria-hidden="true" />
        <strong>Live analysis unavailable</strong>
        <span>No agent or provider connected. No model score available.</span>
      </p>
    </div>
  );
}
