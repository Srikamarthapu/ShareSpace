"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, FolderGit2, ShieldCheck, Users } from "lucide-react";
import { useWorkspaceControls } from "@/features/workspace-controls/store";

export function Setup() {
  const { state, actor, dispatch } = useWorkspaceControls();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const canAdmin = actor?.role === "admin";

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const teamName = String(formData.get("teamName") ?? "");
    const repositoryName = String(formData.get("repositoryName") ?? "");
    const result = dispatch({ type: "save-setup", teamName, repositoryName });
    if (result.code === "invalid" || result.code === "forbidden") {
      setError(result.message);
      return;
    }
    setMessage(result.message);
  }

  return (
    <div className="controls-standalone-page">
      <Link className="back-link" href="/settings">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to settings
      </Link>
      <div className="controls-page-heading">
        <span className="controls-kicker">FIRST STEPS · SAMPLE SETUP</span>
        <h1>Set up your team.</h1>
        <p>Choose a team name and one repository to use in the browser-only examples.</p>
        <span className="controls-sample-tag">No live team or repository is created</span>
      </div>

      <div className="controls-setup-layout">
        <section className="controls-panel" aria-labelledby="setup-form-title">
          <div className="controls-panel-heading">
            <div>
              <span className="controls-kicker">TEAM DETAILS</span>
              <h2 id="setup-form-title">One team, one repository</h2>
            </div>
            <FolderGit2 size={19} aria-hidden="true" />
          </div>
          <form
            className="controls-form"
            key={`${state.teamName}|${state.repositoryName}`}
            onSubmit={save}
          >
            <div className="controls-form-field">
              <label htmlFor="sample-team-name">Team name</label>
              <input
                id="sample-team-name"
                name="teamName"
                defaultValue={state.teamName}
                maxLength={64}
                minLength={2}
                required
                aria-describedby="sample-team-name-help"
                aria-invalid={Boolean(error)}
              />
              <p id="sample-team-name-help" className="controls-field-help">
                2 to 64 characters. Sample changes stay in this browser.
              </p>
            </div>
            <div className="controls-form-field">
              <label htmlFor="sample-repository">Repository identifier</label>
              <input
                id="sample-repository"
                name="repositoryName"
                defaultValue={state.repositoryName}
                maxLength={100}
                pattern="[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?"
                required
                aria-describedby="sample-repository-help"
                aria-invalid={Boolean(error)}
              />
              <p id="sample-repository-help" className="controls-field-help">
                Use one repository slug or owner/name. A second repository cannot be added in this
                sample.
              </p>
            </div>
            <p className="controls-error-message" role="alert">
              {error}
            </p>
            <p className="controls-status-line" role="status" aria-live="polite">
              {message}
            </p>
            <div className="controls-form-actions">
              <button type="submit" className="button button-primary" disabled={!canAdmin}>
                Save sample setup
              </button>
              <Link className="button button-secondary" href="/settings">
                Continue to settings <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            {!canAdmin ? (
              <p className="controls-permission-note">
                This member preview cannot edit team setup. Switch back to the sample admin in
                Settings.
              </p>
            ) : null}
          </form>
        </section>

        <aside className="controls-panel controls-setup-aside">
          <span className="controls-kicker">CURRENT SAMPLE</span>
          <h2>{state.teamName}</h2>
          <code>{state.repositoryName}</code>
          <div className="controls-setup-fact">
            <Users size={16} aria-hidden="true" />
            <span>Maximum two members</span>
          </div>
          <div className="controls-setup-fact">
            <FolderGit2 size={16} aria-hidden="true" />
            <span>One linked repository</span>
          </div>
          <div className="controls-setup-fact">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Repository sharing starts off</span>
          </div>
          <p>
            Sign-in and real team mutations use the separate authenticated flow. This setup only
            edits labeled sample data.
          </p>
        </aside>
      </div>
    </div>
  );
}
