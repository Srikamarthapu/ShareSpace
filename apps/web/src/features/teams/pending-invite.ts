import "server-only";
import { cookies } from "next/headers";
import { inviteTokenFromInput, PENDING_INVITE_COOKIE } from "./invite";

/** Remembers an invite while the visitor signs in. Server actions and route handlers only. */
export async function rememberPendingInvite(token: string) {
  (await cookies()).set(PENDING_INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
}

/** Where to go after sign-in: back to a remembered invite, or the workspace. Clears the invite. */
export async function takePostSignInPath(): Promise<string> {
  const store = await cookies();
  const token = inviteTokenFromInput(store.get(PENDING_INVITE_COOKIE)?.value ?? "");
  store.delete(PENDING_INVITE_COOKIE);
  return token ? `/invite/${token}` : "/live";
}
