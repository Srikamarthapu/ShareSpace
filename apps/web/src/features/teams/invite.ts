import type { ApiErrorCode } from "@workspace/core";

/** Holds an invite token while a signed-out visitor signs in or creates an account. */
export const PENDING_INVITE_COOKIE = "sharespace_invite";

/** Accepts a bare invite token or a pasted invite link. */
export function inviteTokenFromInput(input: string): string | null {
  return /(?:^|\/)(ssi-[0-9a-f]{64})(?:$|[/?#])/.exec(input.trim())?.[1] ?? null;
}

export function teamErrorMessage(code: ApiErrorCode): string {
  switch (code) {
    case "already_in_team":
      return "You’re already in a team. Each account can be in one team.";
    case "invite_rotated":
      return "This invite link was replaced. Ask your team admin for the new one.";
    case "not_found":
      return "This invite link doesn’t work. Check it or ask for a new one.";
    case "forbidden":
      return "Only team admins can do that.";
    case "not_member":
      return "You’re no longer in this team.";
    case "unauthenticated":
      return "Sign in again to continue.";
    case "invalid_request":
      return "Check the details and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
