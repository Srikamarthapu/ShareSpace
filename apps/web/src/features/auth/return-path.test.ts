import { describe, expect, it } from "vitest";
import { safeWorkspaceReturn } from "./return-path";
describe("workspace auth return", () => {
  it("preserves an internal invitation or billing path", () => {
    expect(safeWorkspaceReturn("/live?invite=ssi-test")).toBe("/live?invite=ssi-test");
    expect(safeWorkspaceReturn("/live/billing")).toBe("/live/billing");
  });
  it.each([
    "//evil.example/live",
    "https://evil.example/live",
    "/live/../../evil",
    "/login",
    "/live\\evil",
    undefined,
  ])("rejects unsafe return %s", (input) => {
    expect(safeWorkspaceReturn(input)).toBe("/live");
  });
});
