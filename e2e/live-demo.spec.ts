import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("anonymous visitors reach real account access instead of sample data", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByRole("heading", { name: "Sign in to ShareSpace" })).toBeVisible();
  await page.getByText("Sign in with email", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("Sample workspace", { exact: true })).toHaveCount(0);
  await page.getByText("Create an account with email", { exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("legacy fixture routes cannot expose sample sessions", async ({ page }) => {
  for (const path of [
    "/sessions",
    "/connect",
    "/settings",
    "/storage",
    "/coordination/sample-check",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page.getByRole("heading", { name: "Sign in to ShareSpace" })).toBeVisible();
  }
});

test("an invitation survives the sign-in redirect", async ({ page }) => {
  const token = `ssi-${"a".repeat(64)}`;
  await page.goto(`/join/${token}`);
  await expect(page).toHaveURL(/\/login\?/);
  const current = new URL(page.url());
  expect(current.searchParams.get("next")).toContain(token);
});
