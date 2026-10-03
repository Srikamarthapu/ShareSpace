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
  Trash2,
} from "lucide-react";
import { MemberAvatar } from "@/components/ui";
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
      <p className="controls-global-notice" role="status" aria-live="polite">
        {notice}
      </p>

      <div className="controls-settings-stack">
        <section className="controls-settings-section" aria-labelledby="team-section-title">
          <div className="controls-section-intro">
            <h2 id="team-section-title">Team</h2>
          </div>
          <div className="controls-section-content">
            <div className="controls-team-summary">
              <div>
                <h3>{state.teamName}</h3>
                <div className="controls-team-bubbles" role="group" aria-label="Team members">
                  {state.members.map((member) => (
                    <MemberAvatar key={member.id} {...member} small />
                  ))}
                </div>
              </div>
              <code>{state.repositoryName}</code>
            </div>
            <Link className="text-link" href="/setup">
              Edit <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="controls-settings-section" aria-labelledby="invite-section-title">
          <div className="controls-section-intro">
            <h2 id="invite-section-title">Invite link</h2>
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
                />
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
              <button
                type="button"
                className="button button-primary"
                onClick={createInvite}
                disabled={!canAdmin}
              >
                <Link2 size={15} aria-hidden="true" />
                Create reusable invite
              </button>
            )}
            <p className="controls-status-line" role="status" aria-live="polite">
              {copyStatus}
            </p>
            {!canAdmin ? (
              <p className="controls-permission-note">Only admins can manage invites.</p>
            ) : null}
          </div>
        </section>

        <section className="controls-settings-section" aria-labelledby="people-section-title">
          <div className="controls-section-intro">
            <h2 id="people-section-title">Members</h2>
          </div>
          <div className="controls-section-content">
            <div className="controls-member-list">
              {state.members.map((member) => {
                const isOwner = member.role === "admin";
                const isSelf = member.id === actor?.id;
                const askingToRemove = confirmRemoveId === member.id;
                const avatar = <MemberAvatar {...member} small />;
                return (
                  <div className="controls-member-row" key={member.id}>
                    {avatar}
                    <div className="controls-member-main">
                      <strong>{member.name}</strong>
                    </div>
                    <span className={`controls-role-pill controls-role-${member.role}`}>
                      {member.role}
                    </span>
                    {isOwner ? (
                      <span
                        className="controls-locked-role"
                        title="The team owner cannot be removed"
                      >
                        <LockKeyhole size={13} aria-hidden="true" />
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
            >
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="controls-settings-section" aria-labelledby="sharing-section-title">
          <div className="controls-section-intro">
            <h2 id="sharing-section-title">Sharing</h2>
          </div>
          <div className="controls-section-content">
            <div className="controls-sharing-toggle">
              <div>
                <strong>Share my sessions in {state.repositoryName}</strong>
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
                <strong>{sharingPaused ? "Sharing is paused" : "Pause sharing"}</strong>
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
              <legend>Private sessions</legend>
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
                      {checked ? "Private" : canChangePrivacy ? "Shared" : "Owner only"}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <ul className="controls-share-facts">
              <li>Shared: prompts, responses, and short tool and diff excerpts.</li>
              <li>Stored in Supabase team storage. Overlap context may be processed by Jev.</li>
              <li>Never shared: secrets, env vars, hidden reasoning, or unrelated files.</li>
            </ul>
          </div>
        </section>

        <section
          className="controls-settings-section controls-reset-section"
          aria-labelledby="reset-section-title"
        >
          <div className="controls-section-intro">
            <h2 id="reset-section-title">Reset sample data</h2>
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
