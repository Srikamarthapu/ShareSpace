import { describe, expect, it } from "vitest";
import { inviteTokenFromInput, teamErrorMessage } from "./invite";

const token = "ssi-" + "ab".repeat(32);

describe("invite links", () => {
  it("reads a token from a bare token or a pasted link", () => {
    expect(inviteTokenFromInput(token)).toBe(token);
    expect(inviteTokenFromInput(`  https://app.test/invite/${token}  `)).toBe(token);
    expect(inviteTokenFromInput(`https://app.test/invite/${token}?from=chat`)).toBe(token);
  });
  it("rejects anything that is not a whole invite token", () => {
    expect(inviteTokenFromInput("")).toBeNull();
    expect(inviteTokenFromInput(token.slice(0, -1))).toBeNull();
    expect(inviteTokenFromInput(token + "a")).toBeNull();
    expect(inviteTokenFromInput("ssi-" + "AB".repeat(32))).toBeNull();
  });
  it("explains contract errors in plain words", () => {
    expect(teamErrorMessage("invite_rotated")).toContain("replaced");
    expect(teamErrorMessage("already_in_team")).toContain("one team");
    expect(teamErrorMessage("internal")).toContain("try again");
  });
});
