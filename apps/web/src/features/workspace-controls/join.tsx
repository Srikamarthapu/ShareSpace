"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Link2, Users } from "lucide-react";
import { inviteState, useWorkspaceControls } from "@/features/workspace-controls/store";

export function JoinInvite({ token }: { token: string }) {
  const { state, dispatch } = useWorkspaceControls();
  const [memberName, setMemberName] = useState("");
  const [joinedName, setJoinedName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const status = inviteState(state, token);

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const result = dispatch({ type: "accept-invite", token, memberName });
    if (result.code !== "updated") {
      setError(result.message);
      return;
    }
    setJoinedName(memberName.trim());
    setMessage(result.message);
  }

  const title =
    status === "rotated"
      ? "This invite has been rotated."
      : status === "full"
        ? "This sample team is full."
        : status === "invalid"
          ? "This invitation is not valid."
          : "Join the sample team.";

  return (
    <div className="controls-standalone-page controls-join-page">
      <Link className="back-link" href="/settings">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to sample settings
      </Link>
      <span className="controls-kicker">REUSABLE INVITATION</span>
      <h1>{joinedName ? "You joined the sample team." : title}</h1>
      <p className="controls-join-intro">
        {joinedName
          ? `${joinedName} appears as a sample member. No account was created and no live team was changed.`
          : `Invitation for ${state.teamName} · ${state.repositoryName}`}
      </p>
      <span className="controls-sample-tag">Browser sample only</span>

      {joinedName ? (
        <div
          className="controls-invite-result controls-invite-success"
          role="status"
          aria-live="polite"
        >
          <CircleCheck size={22} aria-hidden="true" />
          <div>
            <strong>{message}</strong>
            <p>
              Invitees receive the member role. Existing team members and the repository remain
              unchanged.
            </p>
          </div>
        </div>
      ) : status === "valid" ? (
        <section className="controls-panel controls-join-card" aria-labelledby="join-form-title">
          <div className="controls-invite-result controls-invite-valid">
            <Link2 size={19} aria-hidden="true" />
            <div>
              <strong>Reusable sample invitation</strong>
              <p>
                Members can join while a slot is available. This link remains active until it is
                rotated.
              </p>
            </div>
          </div>
          <form className="controls-form" onSubmit={join}>
            <div className="controls-form-field">
              <label htmlFor="join-member-name">Your display name</label>
              <input
                id="join-member-name"
                value={memberName}
                onChange={(event) => setMemberName(event.currentTarget.value)}
                minLength={2}
                maxLength={48}
                autoComplete="name"
                required
                aria-describedby="join-name-help"
                aria-invalid={Boolean(error)}
              />
              <p id="join-name-help" className="controls-field-help">
                You will join as a sample member, never as an admin.
              </p>
            </div>
            <p className="controls-error-message" role="alert">
              {error}
            </p>
            <button type="submit" className="button button-primary">
              <Users size={15} aria-hidden="true" />
              Join as a sample member
            </button>
          </form>
        </section>
      ) : (
        <div
          className={`controls-invite-result ${status === "full" ? "controls-invite-full" : "controls-invite-error"}`}
          role="status"
        >
          {status === "full" ? (
            <Users size={21} aria-hidden="true" />
          ) : (
            <CircleAlert size={21} aria-hidden="true" />
          )}
          <div>
            <strong>
              {status === "rotated"
                ? "The previous link can no longer be used."
                : status === "full"
                  ? "There are already two sample members."
                  : "This link does not match an active sample invitation."}
            </strong>
            <p>
              {status === "full"
                ? "An admin can remove a member in Settings. Rotating this reusable link will not create another seat."
                : status === "rotated"
                  ? "Ask the sample admin to share the current link from Settings."
                  : "Create a reusable invitation in Settings to try the sample join flow."}
            </p>
          </div>
        </div>
      )}

      {!joinedName && status === "full" ? (
        <div className="controls-join-next-step">
          <Link className="button button-secondary" href="/settings">
            Review sample members <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      {joinedName ? (
        <div className="controls-join-next-step">
          <Link className="button button-secondary" href="/settings">
            View sample team members <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      <p className="controls-join-footnote">
        Real invitations require sign-in and a server-side membership check. The URL token in this
        screen is sample-only.
      </p>
    </div>
  );
}
