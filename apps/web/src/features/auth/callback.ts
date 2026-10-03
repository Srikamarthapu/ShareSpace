// Authorization resumes in /live, or at an invite remembered in an HTTP-only cookie.
// Caller-provided return URLs are ignored.
export function authCallbackInput(
  url: URL,
): { code: string } | { error: "cancelled" | "callback" | "unavailable" } {
  if (url.searchParams.has("error")) {
    return {
      error: url.searchParams.get("error") === "access_denied" ? "cancelled" : "unavailable",
    };
  }
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048 || /[\s\u0000-\u001f]/u.test(code)) return { error: "callback" };
  return { code };
}

export function loginErrorMessage(error: string | undefined) {
  if (error === "cancelled")
    return "GitHub sign-in was cancelled. You can try again whenever you’re ready.";
  if (error === "callback")
    return "That sign-in link has expired or could not be verified. Start a new sign-in below.";
  if (error === "unavailable")
    return "Authentication is temporarily unavailable. Please try again.";
  return "";
}
