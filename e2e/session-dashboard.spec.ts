import AxeBuilder from "@axe-core/playwright";
import { expect, test as base } from "@playwright/test";

const hydrationError =
  /hydration|hydrated|hydrating|does not match|did not match|server-rendered html/i;

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`Uncaught page error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && hydrationError.test(message.text())) {
          errors.push(`Hydration error: ${message.text()}`);
        }
      });

      await use(errors);

      expect(errors, `Browser errors detected:\n${errors.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

const samCardName = "Sam’s session";
const sriCardName = "Sri’s session";

async function openDashboard(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Workspace" })).toBeVisible();
}

test("home shows the labeled sample sessions and accessible session list", async ({
  page,
}, testInfo) => {
  await openDashboard(page);

  await expect(page.getByText("Sample workspace", { exact: true })).toBeVisible();

  const sessionList = page.getByRole("region", { name: /sessions/i });
  await expect(sessionList).toBeVisible();
  await expect(sessionList.getByRole("status", { name: "Session count" })).toContainText(
    /2\s+sessions?/i,
  );

  const samCard = page.getByRole("article", { name: samCardName });
  const sriCard = page.getByRole("article", { name: sriCardName });
  await expect(samCard).toBeVisible();
  await expect(sriCard).toBeVisible();
  await expect(samCard.getByText(/sample/i).first()).toBeVisible();
  await expect(sriCard.getByText(/sample/i).first()).toBeVisible();
  await expect(samCard.getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(sriCard.getByText("Codex", { exact: true })).toBeVisible();

  const builderFilters = page.getByRole("group", { name: "Filter sessions by builder" });
  await expect(
    builderFilters.getByRole("button", { name: "Everyone", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(builderFilters.getByRole("button", { name: "Sam", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(builderFilters.getByRole("button", { name: "Sri", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  const agentFilter = page.getByRole("combobox", { name: "Agent" });
  await expect(agentFilter.locator("option", { hasText: "All agents" })).toHaveCount(1);
  await expect(agentFilter.locator("option", { hasText: "Claude Code" })).toHaveCount(1);
  await expect(agentFilter.locator("option", { hasText: "Codex" })).toHaveCount(1);
  await expect(page.getByRole("searchbox", { name: "Search shared sessions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset filters", exact: true })).toHaveCount(0);

  await expect(
    page.getByRole("button", { name: /new task|scope resolution|resolve scope|handoff/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /new task|scope resolution|resolve scope|handoff/i }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
});

test("combined filters show the empty state and reset restores both sessions", async ({ page }) => {
  await openDashboard(page);

  const builderFilters = page.getByRole("group", { name: "Filter sessions by builder" });
  await builderFilters.getByRole("button", { name: "Sam", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset filters", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Agent" }).selectOption({ label: "Codex" });
  await expect(page.getByRole("heading", { name: "No matching sessions", level: 2 })).toBeVisible();
  await expect(page.getByRole("article", { name: samCardName })).toHaveCount(0);
  await expect(page.getByRole("article", { name: sriCardName })).toHaveCount(0);

  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(
    builderFilters.getByRole("button", { name: "Everyone", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Agent" }).locator("option:checked")).toHaveText(
    "All agents",
  );
  await expect(page.getByRole("article", { name: samCardName })).toBeVisible();
  await expect(page.getByRole("article", { name: sriCardName })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset filters", exact: true })).toHaveCount(0);
});

test("search filters the session cards by branch name", async ({ page }) => {
  await openDashboard(page);

  await page.getByRole("searchbox", { name: "Search shared sessions" }).fill("feature/shortlist");

  await expect(page.getByRole("article", { name: sriCardName })).toBeVisible();
  await expect(page.getByRole("article", { name: samCardName })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: /sessions/i }).getByRole("status", { name: "Session count" }),
  ).toContainText(/1\s+session/i);
  await expect(page.getByRole("button", { name: "Reset filters", exact: true })).toBeVisible();
});

test("Sam’s session card opens its sample transcript", async ({ page }) => {
  await openDashboard(page);

  const link = page.getByRole("link", { name: "Saved-college API", exact: true });
  await expect(link).toHaveAttribute("href", "/sessions/sample-sam");
  await link.click();

  await expect(page).toHaveURL(/\/sessions\/sample-sam$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("Sri’s session card opens its sample transcript", async ({ page }) => {
  await openDashboard(page);

  const link = page.getByRole("link", { name: "Personal shortlist", exact: true });
  await expect(link).toHaveAttribute("href", "/sessions/sample-sri");
  await link.click();

  await expect(page).toHaveURL(/\/sessions\/sample-sri$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("home has no automated accessibility violations", async ({ page }) => {
  await openDashboard(page);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
  ).toEqual([]);
});

test("mobile dashboard fits a 390px viewport without horizontal scrolling", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Runs in the Chromium mobile viewport project.");
  await openDashboard(page);

  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
});

const supportingRoutes = [
  "/sessions",
  "/sessions/sample-sri",
  "/settings",
  "/settings/connections",
  "/login",
];

for (const route of supportingRoutes) {
  test(`${route} keeps its heading, dark theme, and accessible layout`, async ({ page }) => {
    await page.goto(route);

    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.colorScheme).toMatch(/dark/i);

    const backgroundChannels = layout.bodyBackground.match(/[\d.]+/g)?.map(Number) ?? [];
    expect(backgroundChannels.length).toBeGreaterThanOrEqual(3);
    expect(backgroundChannels.slice(0, 3).every((channel) => channel < 128)).toBe(true);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
    ).toEqual([]);
  });
}
