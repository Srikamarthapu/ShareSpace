import { describe, expect, it } from "vitest";
import { authCallbackInput, loginErrorMessage } from "./callback";

describe("OAuth callback boundary", () => {
  it("requires a bounded authorization code and ignores untrusted return paths", () => {
    expect(
      authCallbackInput(new URL("https://app.test/auth/callback?next=https://evil.test")),
    ).toEqual({ error: "callback" });
    expect(
      authCallbackInput(new URL("https://app.test/auth/callback?code=abc&next=https://evil.test")),
    ).toEqual({ code: "abc" });
    expect(
      authCallbackInput(new URL(`https://app.test/auth/callback?code=${"a".repeat(2049)}`)),
    ).toEqual({ error: "callback" });
    expect(authCallbackInput(new URL("https://app.test/auth/callback?code=a%0Ab"))).toEqual({
      error: "callback",
    });
  });
  it("displays only known messages, never provider-supplied error descriptions", () => {
    expect(
      authCallbackInput(new URL("https://app.test/auth/callback?error=access_denied&code=abc")),
    ).toEqual({ error: "cancelled" });
    expect(loginErrorMessage("<script>private-provider-response</script>")).toBe("");
    expect(loginErrorMessage("cancelled")).toContain("cancelled");
  });
});
