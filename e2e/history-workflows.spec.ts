import { expect, test } from "@playwright/test";

test("session history paginates and a deep event link reveals an older event", async ({ page }) => {
  await page.goto("/sessions/sample-sam");
  await expect(page.getByRole("heading", { level: 1, name: "Saved-college API" })).toBeVisible();
  await expect(page.locator('[data-history-event="sam-history-16"]')).toBeVisible();
  await expect(page.locator('[data-history-event="sam-history-01"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Load older events" }).click();
  await expect(page.locator('[data-history-event="sam-history-01"]')).toBeVisible();

  await page.goto("/sessions/sample-sam#sam-history-01");
  const deepEvent = page.locator('[data-history-event="sam-history-01"]');
  await expect(deepEvent).toBeVisible();
  await expect(deepEvent).toBeInViewport();
});

test("transcript search and event-type filters apply to the selected session", async ({ page }) => {
  await page.goto("/sessions/sample-sam");
  await page
    .getByRole("searchbox", { name: "Search this sample transcript" })
    .fill("Redacted sample tool activity");
  await expect(page.locator('[data-history-event="sam-history-02"]')).toBeVisible();
  await expect(page.locator('[data-history-event="sam-history-01"]')).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search this sample transcript" }).fill("");
  await page.getByRole("combobox", { name: "Filter transcript event type" }).selectOption("user");
  await expect(page.locator('[data-history-event="sam-request"]')).toBeVisible();
  await expect(page.locator('[data-history-event="sam-history-01"]')).toHaveCount(0);
});

test("reconnect persists fixture catch-up and suppresses repeated event IDs", async ({ page }) => {
  await page.goto("/sessions/sample-sam");
  await page.getByText("Sample lab controls", { exact: true }).click();
  await page.getByRole("radio", { name: "Unavailable" }).check();
  await expect(page.getByText("Sample stream · unavailable")).toBeVisible();

  await page.getByRole("button", { name: "Reconnect and catch up" }).click();
  await expect(page.getByTestId("catchup-result")).toContainText("Recovered 2 sample events");
  await page.getByRole("button", { name: "New sample events · Jump to latest" }).click();
  await expect(page.locator('[data-history-event="sam-catchup-01"]')).toBeVisible();
  await expect(page.locator('[data-history-event="sam-catchup-02"]')).toBeVisible();

  await page.getByRole("button", { name: "Reconnect and catch up" }).click();
  await expect(page.getByTestId("catchup-result")).toContainText(
    "2 repeated sample deliveries were deduplicated",
  );
  await expect(page.locator('[data-history-event="sam-catchup-01"]')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('[data-history-event="sam-catchup-01"]')).toHaveCount(1);
});

test("revoked access and deleted history render different states", async ({ page }) => {
  await page.goto("/sessions/sample-sam");
  await page.getByText("Sample lab controls", { exact: true }).click();
  await page.getByRole("button", { name: "Simulate access revoked" }).click();
  await expect(page.getByTestId("access-revoked")).toContainText("Access revoked");
  await expect(page.getByTestId("access-revoked")).not.toContainText("sam-request");

  await page.goto("/sessions/sample-sam");
  await expect(page.getByTestId("access-revoked")).toBeVisible();
  await page.getByRole("button", { name: "Restore sample access" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Saved-college API" })).toBeVisible();
  await expect(page.locator('[data-history-event="sam-history-16"]')).toBeVisible();

  await page.goto("/sessions/sample-sri");
  await page.getByRole("button", { name: "Delete my sample session" }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByTestId("removed-history")).toContainText("History removed");
  await expect(page.getByTestId("removed-history")).not.toContainText("sri-request");

  await page.goto("/sessions/sample-sri#sri-request");
  await expect(page.getByTestId("removed-history")).toBeVisible();
});

test("deleting a personal session hides it from session history", async ({ page }) => {
  await page.goto("/sessions/sample-sam");
  await expect(page.getByRole("button", { name: "Delete my sample session" })).toHaveCount(0);

  await page.goto("/sessions/sample-sri");
  await page.getByRole("button", { name: "Delete my sample session" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Personal shortlist" })).toBeVisible();

  await page.getByRole("button", { name: "Delete my sample session" }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await page.goto("/sessions");
  await expect(page.getByRole("link", { name: /Saved-college API/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Personal shortlist/ })).toHaveCount(0);
});
