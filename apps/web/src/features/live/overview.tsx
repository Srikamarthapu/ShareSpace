"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, GitBranch, Info, Plus, Search } from "lucide-react";
import { AGENT_LABELS } from "@workspace/core";
import type { WorkspaceData } from "./data";

export function LiveOverview({ data }: { data: WorkspaceData }) {
  const [builder, setBuilder] = useState("all");
  const [agent, setAgent] = useState("all");
  const [query, setQuery] = useState("");
  const sessions = data.sessions.filter(
    (session) =>
      (builder === "all" || session.user_id === builder) &&
      (agent === "all" || session.agent === agent) &&
      `${session.title} ${session.branch} ${session.latest_prompt}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const filtered = builder !== "all" || agent !== "all" || query !== "";
  const overlap = data.warnings.find((warning) => warning.outcome === "warning");
  return (
    <div className="session-dashboard">
      <div className="page-heading">
        <div>
          <h1>Workspace</h1>
          <p>Shared sessions. A little context before your next change.</p>
        </div>
        <Link className="button button-primary" href="/live?view=devices">
          <Plus size={16} aria-hidden="true" />
          Connect agent
        </Link>
      </div>
      <section className="dashboard-sessions" aria-labelledby="shared-sessions-heading">
        <div className="section-heading">
          <h2 id="shared-sessions-heading">
            Shared sessions <span className="count">{data.sessions.length}</span>
          </h2>
          <Link className="text-link" href="/live?view=manage">
            Manage team
          </Link>
        </div>
        {(!data.sharing?.enabled || data.sharing.paused) && (
          <p className="dashboard-notice" role="status">
            <Info size={16} aria-hidden="true" />
            Your sharing is {data.sharing?.paused ? "paused" : "off"}. Existing history remains
            visible.<Link href="/live?view=settings">Review sharing</Link>
          </p>
        )}
        <div className="session-filters">
          <div className="filter-row" role="group" aria-label="Filter sessions by builder">
            {[{ user_id: "all", display_name: "Everyone" }, ...data.members].map((member) => (
              <button
                key={member.user_id}
                type="button"
                aria-pressed={builder === member.user_id}
                className={`filter ${builder === member.user_id ? "selected" : ""}`}
                onClick={() => setBuilder(member.user_id)}
              >
                {member.display_name}
              </button>
            ))}
          </div>
          <div className="session-agent-filter">
            <label className="sr-only" htmlFor="overview-agent">
              Agent
            </label>
            <select
              id="overview-agent"
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
            >
              <option value="all">All agents</option>
              {Object.entries(AGENT_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search shared sessions</span>
            <input
              type="search"
              placeholder="Search sessions…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="session-list-status">
          <span role="status">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            {filtered ? " match your filters" : " · Most recent first"}
          </span>
          {filtered && (
            <button
              type="button"
              className="reset-filters"
              onClick={() => {
                setBuilder("all");
                setAgent("all");
                setQuery("");
              }}
            >
              Reset filters
            </button>
          )}
        </div>
        <div className="shared-session-list">
          {sessions.map((session) => {
            const name =
              data.members.find((member) => member.user_id === session.user_id)?.display_name ??
              "Former member";
            return (
              <article
                className="shared-session-row"
                key={session.id}
                aria-label={`${name}’s session`}
              >
                <div className="session-person">
                  <span className="avatar" aria-hidden="true">
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <strong>{name}</strong>
                    <span>{AGENT_LABELS[session.agent]}</span>
                  </div>
                </div>
                <div className="session-row-content">
                  <h3>
                    <Link href={`/live?view=sessions&session=${session.id}`}>
                      {session.title ?? "Untitled session"}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  </h3>
                  <p className="session-prompt">{session.latest_prompt}</p>
                  <span className="session-branch">
                    <GitBranch size={13} aria-hidden="true" />
                    <code>{session.branch ?? "Branch unavailable"}</code>
                  </span>
                </div>
                <div className="session-row-meta">
                  <time dateTime={session.last_activity_at}>
                    {new Date(session.last_activity_at).toLocaleDateString()}
                  </time>
                  <span className="session-sharing">
                    {session.history_removed_at ? "History removed" : session.visibility}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
        {!sessions.length && (
          <div className="empty-state">
            <h3>{filtered ? "No matching sessions" : "Your shared history starts here"}</h3>
            <p>
              {filtered
                ? "Try a different builder, agent, or search."
                : "Connect an agent and enable sharing to see your team's real sessions."}
            </p>
          </div>
        )}
      </section>
      {overlap && (
        <section className="overlap-notice" aria-labelledby="overlap-heading">
          <Info size={18} aria-hidden="true" />
          <div>
            <h2 id="overlap-heading">Possible overlap</h2>
            <p>{overlap.findings[0]?.summary ?? "Your team has an overlap warning to review."}</p>
            <Link href="/live?view=warnings">Review warning →</Link>
          </div>
        </section>
      )}
    </div>
  );
}
