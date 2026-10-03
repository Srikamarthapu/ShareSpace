import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const main = (page: import("@playwright/test").Page) => page.getByRole("main");

test("setup edits one sample team and one repository", async ({ page }) => {
  await page.goto("/setup");
  const content = main(page);

  await expect(content.getByRole("heading", { level: 1, name: "Set up your team." })).toBeVisible();
  await content.getByLabel("Team name").fill("Studio North");
  await content.getByLabel("Repository identifier").fill("sri/studio-north");
  await content.getByRole("button", { name: "Save sample setup" }).click();
  await expect(content.getByRole("status")).toContainText(
    "Sample team and repository settings saved in this browser.",
  );
  await expect(content.getByText("One linked repository")).toBeVisible();

  await page.goto("/settings");
  await expect(main(page).getByRole("heading", { name: "Studio North" })).toBeVisible();
  await expect(main(page).getByText("sri/studio-north", { exact: true })).toBeVisible();
});

test("reusable invite distinguishes full, rotated, and accepted sample joins", async ({ page }) => {
  await page.goto("/settings");
  const content = main(page);
  await content.getByRole("button", { name: "Create reusable invite" }).click();
  const invite = content.getByLabel("Current sample invitation");
  await expect(invite).toHaveValue("/join/sample-invite-1");

  await page.goto("/join/sample-invite-1");
  await expect(
    main(page).getByRole("heading", { name: "This sample team is full." }),
  ).toBeVisible();

  await page.goto("/settings");
  const settings = main(page);
  await settings.getByRole("button", { name: "Rotate link" }).click();
  await expect(settings.getByLabel("Current sample invitation")).toHaveValue(
    "/join/sample-invite-2",
  );

  await page.goto("/join/sample-invite-1");
  await expect(
    main(page).getByRole("heading", { name: "This invite has been rotated." }),
  ).toBeVisible();

  await page.goto("/settings");
  const adminSettings = main(page);
  await adminSettings.getByRole("button", { name: "Remove Sam from sample team" }).click();
  await adminSettings.getByRole("button", { name: "Confirm removal" }).click();
  await expect(
    adminSettings.getByRole("status").filter({ hasText: "Sam was removed from the sample team." }),
  ).toBeVisible();
  await expect(adminSettings.getByText("Sam", { exact: true })).toHaveCount(0);

  await page.goto("/join/sample-invite-2");
  const join = main(page);
  await expect(join.getByRole("heading", { name: "Join the sample team." })).toBeVisible();
  await join.getByLabel("Your display name").fill("Alex Morgan");
  await join.getByRole("button", { name: "Join as a sample member" }).click();
  await expect(join.getByRole("heading", { name: "You joined the sample team." })).toBeVisible();
  await expect(join.getByRole("status")).toContainText(
    "Alex Morgan joined the sample team as a member.",
  );

  await page.goto("/settings");
  await expect(main(page).getByText("Alex Morgan", { exact: true })).toBeVisible();
});

test("pairing consent and device revocation stay scoped to the requesting user", async ({
  page,
}) => {
  await page.goto("/connect");
  let content = main(page);
  const request = content.getByRole("article", { name: "Sam Codex pairing request" });
  await expect(request).toBeVisible();
  await expect(request.getByText("Sam (sam)")).toBeVisible();
  await expect(request.getByText("college-compass", { exact: true })).toHaveCount(2);
  await expect(request.getByText("partial", { exact: true })).toBeVisible();
  await expect(request.getByText("unsupported", { exact: true })).toBeVisible();
  await expect(request.getByRole("button", { name: "Approve sample device" })).toBeDisabled();
  await expect(content.getByText("No device credential is generated here.")).toBeVisible();

  await page.goto("/settings");
  content = main(page);
  await content.getByLabel("Preview sample role").selectOption("sam");
  await page.goto("/connect");
  content = main(page);
  const samRequest = content.getByRole("article", { name: "Sam Codex pairing request" });
  await samRequest.getByRole("button", { name: "Approve sample device" }).click();
  await expect(samRequest.getByText("Approved sample", { exact: true })).toBeVisible();
  await expect(
    content
      .getByRole("article")
      .filter({ hasText: "Sam’s Codex sample device" })
      .getByRole("button", { name: "Revoke my sample device" }),
  ).toBeEnabled();

  await content
    .getByRole("article")
    .filter({ hasText: "Sam’s Codex sample device" })
    .getByRole("button", { name: "Revoke my sample device" })
    .click();
  await expect(
    content
      .getByRole("article")
      .filter({ hasText: "Sam’s Codex sample device" })
      .getByText("Revoked sample device"),
  ).toBeVisible();
});

test("sharing is opt-in and private-session choices are personal", async ({ page }) => {
  await page.goto("/settings");
  const content = main(page);
  const sharing = content.locator("#sample-sharing-enabled");
  await expect(sharing).not.toBeChecked();
  await expect(content.getByText(/Supabase team storage/)).toBeVisible();
  await expect(content.getByText(/processed by Jev/)).toBeVisible();
  await expect(content.getByText(/hidden reasoning/)).toBeVisible();

  await content.locator("#sample-sharing-enabled").check();
  await expect(content.locator("#sample-sharing-enabled")).toBeChecked();
  await content.locator("#private-sample-sri").check();
  await expect(content.locator("#private-sample-sri")).toBeChecked();
  await expect(content.locator("#private-sample-sam")).toBeDisabled();
  await content.getByRole("button", { name: "Pause your sample sharing" }).click();
  await expect(content.getByRole("button", { name: "Resume your sample sharing" })).toBeVisible();
});

test("settings, connection, setup, and join screens pass the accessibility scan", async ({
  page,
}) => {
  for (const route of ["/settings", "/connect", "/setup", "/join/invalid-token"]) {
    await page.goto(route);
    const content = main(page);
    await expect(content.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
    ).toEqual([]);
  }
});

test("setup and settings have no horizontal overflow at the mobile viewport", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Runs in the Chromium mobile viewport project.");
  for (const route of ["/settings", "/connect", "/setup", "/join/invalid-token"]) {
    await page.goto(route);
    const width = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
  }
});
