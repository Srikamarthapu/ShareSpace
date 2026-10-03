"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  CirclePause,
  Copy,
  Link2,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { resetSampleHistory } from "@/features/history/history-store";
import { useWorkspace } from "@/components/workspace-provider";
import {
  samplePrivateSessionOptions,
  useWorkspaceControls,
} from "@/features/workspace-controls/store";

export function Settings() {
  const workspace = useWorkspace();
  const controls = useWorkspaceControls();
  const { state, actor, sharingEnabled, sharingPaused, privateSessions, dispatch } = controls;
  const [copyStatus, setCopyStatus] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState("");
  const canAdmin = actor?.role === "admin";
  const invitePath = state.inviteToken ? `/join/${encodeURIComponent(state.inviteToken)}` : "";

  function update(message: string) {
    setNotice(message);
  }

  async function copyInvite() {
    if (!invitePath) return;
    try {
      await navigator.clipboard.writeText(new URL(invitePath, window.location.origin).toString());
      setCopyStatus("Sample invitation link copied. It works only in this browser sample.");
    } catch {
      setCopyStatus("Copy is unavailable. Select the sample link above to copy it.");
    }
  }

  function createInvite() {
    const result = dispatch({ type: "create-invite" });
    update(result.message);
  }

  function rotateInvite() {
    const result = dispatch({ type: "rotate-invite" });
    update(result.message);
    setCopyStatus("");
  }

  function removeMember(memberId: string) {
    if (confirmRemoveId !== memberId) {
      setConfirmRemoveId(memberId);
      return;
    }
    const result = dispatch({ type: "remove-member", memberId });
    update(result.message);
    setConfirmRemoveId("");
  }

  function resetSamples() {
    workspace.reset();
    const controlsReset = controls.reset();
    const historyReset = resetSampleHistory();
    setConfirmReset(false);
    setCopyStatus("");
    setNotice(
      controlsReset && historyReset
        ? "Sample team controls, devices, sharing preferences, and session history were reset in this browser."
        : "Some sample data could not be reset. Check browser storage access and try again.",
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEAM AND SHARING CONTROLS</div>
          <h1>Settings</h1>
          <p>Manage the sample team, invitations, device access, and sharing choices.</p>
        </div>
        <span className="controls-sample-tag">Browser sample only</span>
      </div>
      <p className="controls-global-notice" role="status" aria-live="polite">
        {notice}
      </p>

      <div className="controls-settings-stack">
        <section className="controls-settings-section" aria-labelledby="team-section-title">
          <div className="controls-section-intro">
            <span className="controls-section-icon">
              <Users size={18} aria-hidden="true" />
            </span>
            <h2 id="team-section-title">Team and repository</h2>
            <p>
              One sample team and one linked repository. Edit the setup without changing live
              accounts.
            </p>
          </div>
          <div className="controls-section-content">
            <div className="controls-team-summary">
              <div>
                <span className="controls-kicker">SAMPLE TEAM</span>
                <h3>{state.teamName}</h3>
              </div>
              <code>{state.repositoryName}</code>
            </div>
            <Link className="text-link" href="/setup">
              Edit team setup <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <div className="controls-notice controls-notice-neutral">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                The sample allows at most two members and one repository. No repository is read or
                connected here.
              </span>
            </div>
          </div>
        </section>

        <section className="controls-settings-section" aria-labelledby="invite-section-title">
          <div className="controls-section-intro">
            <span className="controls-section-icon">
              <Link2 size={18} aria-hidden="true" />
            </span>
            <h2 id="invite-section-title">Reusable invitation</h2>
            <p>Create a sample link, copy it, and rotate it to invalidate the earlier link.</p>
          </div>
          <div className="controls-section-content">
            {state.inviteToken ? (
              <>
                <label htmlFor="sample-invite-link">Current sample invitation</label>
                <input
                  id="sample-invite-link"
                  className="controls-link-input"
                  value={invitePath}
                  readOnly
                  aria-describedby="invite-link-help"
                />
                <p id="invite-link-help" className="controls-field-help">
                  Reusable in this browser sample. Rotation prevents future joins through the prior
                  sample link.
                </p>
                <div className="controls-button-row">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={copyInvite}
                    disabled={!canAdmin}
                  >
                    {copyStatus.startsWith("Sample invitation link copied") ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                    Copy sample link
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={rotateInvite}
                    disabled={!canAdmin}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Rotate link
                  </button>
                  <Link className="button button-ghost" href={invitePath}>
                    Open join screen
                  </Link>
                </div>
              </>
            ) : (
              <div className="controls-empty-invite">
                <p>No sample invitation is active yet. Create one to open the join flow.</p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={createInvite}
                  disabled={!canAdmin}
                >
                  <Link2 size={15} aria-hidden="true" />
                  Create reusable invite
                </button>
              </div>
            )}
            <p className="controls-status-line" role="status" aria-live="polite">
              {copyStatus}
            </p>
            {!canAdmin ? (
              <p className="controls-permission-note">
                Member preview cannot create or rotate invitations.
              </p>
            ) : null}
          </div>
        </section>

        <section className="controls-settings-section" aria-labelledby="people-section-title">
          <div className="controls-section-intro">
            <span className="controls-section-icon">
              <Users size={18} aria-hidden="true" />
            </span>
            <h2 id="people-section-title">People and roles</h2>
            <p>New invitees join as members. The team owner remains an admin.</p>
          </div>
          <div className="controls-section-content">
            <label htmlFor="sample-role-preview">Preview sample role</label>
            <select
              id="sample-role-preview"
              value={state.actingMemberId}
              onChange={(event) => {
                const result = dispatch({
                  type: "preview-as",
                  memberId: event.currentTarget.value,
                });
                update(result.message);
              }}
              aria-describedby="role-preview-help"
            >
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
            <p id="role-preview-help" className="controls-field-help">
              Preview only. It does not sign in, create an account, or grant access.
            </p>

            <div className="controls-member-list">
              {state.members.map((member) => {
                const isOwner = member.role === "admin";
                const isSelf = member.id === actor?.id;
                const askingToRemove = confirmRemoveId === member.id;
                const avatar =
                  member.name === "Sam" || member.name === "Sri" ? (
                    <Avatar name={member.name} small />
                  ) : (
                    <span className="avatar avatar-small controls-avatar" aria-hidden="true">
                      {member.name.slice(0, 2).toUpperCase()}
                    </span>
                  );
                return (
                  <div className="controls-member-row" key={member.id}>
                    {avatar}
                    <div className="controls-member-main">
                      <strong>{member.name}</strong>
                      <span>
                        {isOwner
                          ? "Team owner · role locked"
                          : "Joined through the reusable sample invitation"}
                      </span>
                    </div>
                    <span className={`controls-role-pill controls-role-${member.role}`}>
                      {member.role}
                    </span>
                    {isOwner ? (
                      <span className="controls-locked-role">
                        <LockKeyhole size={13} aria-hidden="true" />
                        Owner locked
                      </span>
                    ) : askingToRemove ? (
                      <span className="controls-button-row controls-member-confirm">
                        <button
                          type="button"
                          className="button button-danger"
                          onClick={() => removeMember(member.id)}
                          disabled={!canAdmin || isSelf}
                        >
                          Confirm removal
                        </button>
                        <button
                          type="button"
                          className="button button-ghost"
                          onClick={() => setConfirmRemoveId("")}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="button button-danger controls-remove-button"
                        onClick={() => removeMember(member.id)}
                        disabled={!canAdmin || isSelf}
                        aria-label={`Remove ${member.name} from sample team`}
                        title={
                          !canAdmin
                            ? "Only a sample admin can remove members"
                            : isSelf
                              ? "You cannot remove the current sample identity"
                              : undefined
                        }
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="controls-role-rule">
              {canAdmin
                ? "Only the sample admin can remove a member. Invited people join as members, and the team owner cannot be removed or reassigned."
                : "Member role cannot remove teammates, manage invitations, or approve another member’s device."}
            </p>
          </div>
        </section>

        <section className="controls-settings-section" aria-labelledby="sharing-section-title">
          <div className="controls-section-intro">
            <span className="controls-section-icon">
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <h2 id="sharing-section-title">Sharing and privacy</h2>
            <p>
              Your sharing is off by default. Opt in for this repository, pause your capture, or
              keep your own session private.
            </p>
          </div>
          <div className="controls-section-content">
            <div className="controls-sharing-toggle">
              <div>
                <strong>Your opt-in for {state.repositoryName}</strong>
                <p>
                  {sharingEnabled
                    ? "Your sample sessions are opted in for this repository."
                    : "Off. Your new sample sessions are not eligible for sharing."}
                </p>
              </div>
              <label className="controls-switch" htmlFor="sample-sharing-enabled">
                <span>{sharingEnabled ? "On" : "Off"}</span>
                <input
                  id="sample-sharing-enabled"
                  type="checkbox"
                  checked={sharingEnabled}
                  onChange={(event) => {
                    const result = dispatch({
                      type: "set-sharing-enabled",
                      enabled: event.currentTarget.checked,
                    });
                    update(result.message);
                  }}
                />
              </label>
            </div>

            <div className="controls-sharing-pause">
              <div>
                <strong>
                  {sharingPaused ? "Your sharing is paused" : "Pause your future sharing"}
                </strong>
                <p>Pausing affects your future capture. Existing sample history is unchanged.</p>
              </div>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  const result = dispatch({ type: "set-sharing-paused", paused: !sharingPaused });
                  update(result.message);
                }}
              >
                {sharingPaused ? (
                  <Play size={15} aria-hidden="true" />
                ) : (
                  <CirclePause size={15} aria-hidden="true" />
                )}
                {sharingPaused ? "Resume your sample sharing" : "Pause your sample sharing"}
              </button>
            </div>

            <fieldset className="controls-private-sessions">
              <legend>Private sample sessions</legend>
              <p>
                Only a session’s owner can change its privacy. Private sessions stay excluded even
                while sharing is enabled.
              </p>
              {samplePrivateSessionOptions.map((session) => {
                const ownerId = session.id === "sample-sam" ? "sam" : "sri";
                const checked = privateSessions.includes(session.id);
                const canChangePrivacy = actor?.id === ownerId;
                return (
                  <label
                    className="controls-session-option"
                    key={session.id}
                    htmlFor={`private-${session.id}`}
                  >
                    <input
                      id={`private-${session.id}`}
                      type="checkbox"
                      checked={checked}
                      disabled={!canChangePrivacy}
                      onChange={(event) => {
                        const result = dispatch({
                          type: "set-private-session",
                          sessionId: session.id,
                          isPrivate: event.currentTarget.checked,
                        });
                        update(result.message);
                      }}
                    />
                    <span>{session.label}</span>
                    <span
                      className={`controls-state-pill ${checked ? "controls-state-private" : "controls-state-eligible"}`}
                    >
                      {checked
                        ? "Private"
                        : canChangePrivacy
                          ? "Eligible if sharing is on"
                          : "Owner only"}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="controls-disclosure" aria-labelledby="sharing-disclosure-title">
              <div className="controls-disclosure-heading">
                <LockKeyhole size={17} aria-hidden="true" />
                <h3 id="sharing-disclosure-title">What the planned sharing flow includes</h3>
              </div>
              <ul>
                <li>
                  Visible prompts and responses, bounded tool excerpts, and bounded diff excerpts.
                </li>
                <li>
                  Shared content is intended for Supabase team storage; approved overlap context may
                  be processed by Jev.
                </li>
                <li>
                  History uses a sliding storage window with oldest eligible sessions removed when
                  capacity thresholds require cleanup; there is no fixed age cutoff.
                </li>
                <li>
                  Raw secrets, environment variables, hidden reasoning, unrelated files, and
                  complete terminal history are excluded.
                </li>
              </ul>
              <p>
                This is a product disclosure example. The sample does not capture or upload real
                session content.
              </p>
            </div>
            <p className="controls-permission-note">
              This preference applies to {actor?.name ?? "the current member"} only. It does not
              change another member’s capture choices.
            </p>
          </div>
        </section>

        <section
          className="controls-settings-section controls-reset-section"
          aria-labelledby="reset-section-title"
        >
          <div className="controls-section-intro">
            <span className="controls-section-icon">
              <RotateCcw size={18} aria-hidden="true" />
            </span>
            <h2 id="reset-section-title">Reset sample data</h2>
            <p>Restore the original synthetic team, invitations, devices, and session fixtures.</p>
          </div>
          <div className="controls-section-content">
            {confirmReset ? (
              <div className="controls-reset-confirm">
                <p>This affects sample data stored in this browser only.</p>
                <div className="controls-button-row">
                  <button type="button" className="button button-danger" onClick={resetSamples}>
                    Reset sample workspace
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset sample workspace
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
