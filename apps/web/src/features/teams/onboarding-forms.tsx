"use client";

import { useActionState } from "react";
import { createTeam, openInviteLink } from "./actions";

export function CreateTeamForm() {
  const [state, action, pending] = useActionState(createTeam, { error: "" });
  return (
    <form action={action}>
      <label htmlFor="team-name">Team name</label>
      <input id="team-name" name="team_name" required minLength={2} maxLength={80} />
      <label htmlFor="team-repository">GitHub repository</label>
      <input
        id="team-repository"
        name="repository"
        required
        maxLength={200}
        placeholder="owner/name"
        autoComplete="off"
      />
      {state.error && (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      )}
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create team"}
      </button>
    </form>
  );
}

export function JoinLinkForm() {
  const [state, action, pending] = useActionState(openInviteLink, { error: "" });
  return (
    <form action={action}>
      <label htmlFor="invite-link">Invite link</label>
      <input id="invite-link" name="invite" required maxLength={500} autoComplete="off" />
      {state.error && (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      )}
      <button className="button button-secondary" type="submit" disabled={pending}>
        Open invite
      </button>
    </form>
  );
}
