/** Only the authenticated workspace may be an auth return target. */
export function safeWorkspaceReturn(input: unknown): string {
  if (typeof input !== "string" || input.length > 500 || /[\\\s\u0000-\u001f]/u.test(input))
    return "/live";
  try {
    const url = new URL(input, "https://sharespace.invalid");
    if (
      url.origin !== "https://sharespace.invalid" ||
      !["/live", "/live/billing"].includes(url.pathname)
    )
      return "/live";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/live";
  }
}
