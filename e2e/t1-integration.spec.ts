import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("privacy belongs to the selected member across settings and the dashboard", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.locator("#sample-sharing-enabled").check();
  await page.locator("#private-sample-sri").check();
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Sri’s session" })).toContainText(
    "Sample · private",
  );
  await expect(page.getByRole("article", { name: "Sam’s session" })).toContainText(
    "Sample · sharing off",
  );
  await page.goto("/settings");
  await page.getByLabel("Preview sample role").selectOption("sam");
  await page.goto("/sessions/sample-sri");
  await expect(page.getByRole("button", { name: "Delete my sample session" })).toHaveCount(0);
  await page.goto("/sessions/sample-sam");
  await expect(page.getByRole("button", { name: "Delete my sample session" })).toBeVisible();
});

test("deletion clears dashboard context and reset restores the entire sample", async ({ page }) => {
  await page.goto("/sessions/sample-sri");
  await page.getByRole("button", { name: "Delete my sample session" }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByTestId("removed-history")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Sri’s session" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Possible overlap in saved-college storage" }),
  ).toHaveCount(0);
  await expect(page.locator('.activity-list a[href*="sample-sri"]')).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset sample workspace", exact: true }).click();
  await expect(
    page.getByText("This affects sample data stored in this browser only."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset sample workspace", exact: true }).click();
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Sri’s session" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Possible overlap in saved-college storage" }),
  ).toBeVisible();
});

for (const route of ["/warnings", "/warnings/college-scope", "/storage", "/guide"]) {
  test(`${route} is accessible and fits the viewport`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
    if (route === "/warnings/college-scope")
      await page.screenshot({ path: testInfo.outputPath("warning-detail.png"), fullPage: true });
  });
}
