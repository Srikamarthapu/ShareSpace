import { expect, test } from "@playwright/test";

test("warning feed keeps overlap, completed no-overlap, and unavailable outcomes distinct", async ({
  page,
}) => {
  await page.goto("/warnings");

  await expect(page.getByRole("heading", { name: "Overlap warnings" })).toBeVisible();
  await expect(page.getByText("Overlap warning", { exact: true })).toBeVisible();
  await expect(page.getByText("No overlap found", { exact: true })).toBeVisible();
  await expect(page.getByText("Check unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText(/checks never block your work/i)).toBeVisible();
  await expect(page.getByText(/\b\d+(?:\.\d+)?%/)).toHaveCount(0);
});

test("warning details link to stable sample events without inventing a score", async ({ page }) => {
  await page.goto("/warnings/college-scope");

  await expect(
    page.getByRole("heading", { name: "Personal shortlist and saved-college API" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open sample event: Sri’s request" }),
  ).toHaveAttribute("href", "/sessions/sample-sri#sri-request");
  await expect(
    page.getByRole("link", { name: "Open sample event: Sam’s request" }),
  ).toHaveAttribute("href", "/sessions/sample-sam#sam-request");
  await expect(page.getByText(/no numeric model score is available/i)).toBeVisible();
});

test("unknown capacity stays unknown and deleting own sample history hides linked warnings", async ({
  page,
}) => {
  await page.goto("/settings/storage");
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();

  await page.getByText("Preview another sample scenario").click();
  await page.getByLabel("Scenario").selectOption("unknown");
  await expect(page.getByRole("status").filter({ hasText: "unknown, not zero" })).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();

  await page.getByLabel("Scenario").selectOption("warning");
  await page.getByText("Review deletion").click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your session history was removed" }),
  ).toBeVisible();

  await page.goto("/warnings/college-scope");
  await expect(page.getByRole("heading", { name: "History removed" })).toBeVisible();
  await expect(page.getByText("Personal shortlist and saved-college API")).toHaveCount(0);
  await expect(
    page.getByText("Save colleges to a personal shortlist and manage each person’s choices."),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open removed session 1" })).toHaveAttribute(
    "href",
    "/sessions/sample-sri#sri-request",
  );

  await page.getByRole("link", { name: "Open removed session 1" }).click();
  await expect(page).toHaveURL(/\/sessions\/sample-sri#sri-request$/);
  await expect(page.getByRole("heading", { name: "History removed" })).toBeVisible();
});

test("revoked warning context shows no cached title or excerpts", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "sharespace:sample:history:v1",
      JSON.stringify({
        version: 1,
        deletedSessionIds: [],
        revokedSessionIds: ["sample-sri"],
        streamStatus: "connected",
        receivedEvents: [],
        lastCatchup: null,
      }),
    );
  });
  await page.goto("/warnings/college-scope");

  await expect(page.getByRole("heading", { name: "Access revoked" })).toBeVisible();
  await expect(page.getByText("Personal shortlist and saved-college API")).toHaveCount(0);
  await expect(
    page.getByText("Both sample requests mention per-person saved-college storage and management."),
  ).toHaveCount(0);
  await expect(
    page.getByText("Save colleges to a personal shortlist and manage each person’s choices."),
  ).toHaveCount(0);
});
