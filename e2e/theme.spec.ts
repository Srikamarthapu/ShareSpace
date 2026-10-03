import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("theme preference survives navigation and reload and syncs between tabs", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const toggle = page.getByRole("button", { name: "Switch to dark mode" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

  const second = await context.newPage();
  await second.goto("/login");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await second.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await second.close();
});

test("system appearance is followed until a theme is explicitly selected", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme control works when browser storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", {
      value: () => {
        throw new Error("Storage blocked");
      },
    });
    Object.defineProperty(Storage.prototype, "setItem", {
      value: () => {
        throw new Error("Storage blocked");
      },
    });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} theme remains accessible on account access surfaces`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("button", { name: /Switch to .* mode/ })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations, `${theme}: ${path}`).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (path === "/login") {
        await page.screenshot({
          path: testInfo.outputPath(`login-${theme}.png`),
          fullPage: true,
        });
      }
    }
  });
}
