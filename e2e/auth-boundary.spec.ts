import { expect, test } from "@playwright/test";

test("unauthenticated live workspace never displays sample records", async ({ page }) => {
  await page.goto("/live");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByRole("heading", { name: "Sign in to ShareSpace" })).toBeVisible();
  await expect(page.getByText("Saved-college API", { exact: true })).toHaveCount(0);
});

test("invalid OAuth callback returns a safe error without following a return URL", async ({
  page,
}) => {
  await page.goto("/auth/callback?next=https://example.com&error_description=private-response");
  await expect(page).toHaveURL(/\/login\?error=callback$/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be verified");
  await expect(page.getByText("private-response")).toHaveCount(0);
});

test("cancelled sign-in is recoverable and never exposes provider error text", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=private-response");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("cancelled");
  await page.getByText("Sign in with email", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("private-response")).toHaveCount(0);
});
