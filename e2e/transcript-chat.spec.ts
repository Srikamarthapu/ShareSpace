import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  test(`${theme} conversation distinguishes teammate and agent and keeps tool details usable`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/sessions/sample-sam#sam-request");
    const prompt = page.locator('[data-history-event="sam-request"]');
    const reply = page.locator('[data-history-event="sam-response"]');
    const tool = page.locator('[data-history-event="sam-tool"]');
    await expect(prompt).toBeInViewport();
    await expect(prompt).toHaveAccessibleName("Sam: Sam shared a prompt");
    await expect(reply).toHaveAccessibleName(
      "Claude Code: Claude Code outlined the sample API scope",
    );
    await expect(prompt).toContainText("Build the saved-college API.");
    await expect(reply).toContainText("The sample response outlines API and persistence.");
    await expect(page.getByRole("list", { name: "Conversation messages" })).toBeVisible();

    const promptBox = await prompt.boundingBox();
    const replyBox = await reply.boundingBox();
    expect(promptBox!.x).toBeGreaterThan(replyBox!.x);
    await expect(tool.getByText("Redacted excerpt", { exact: true })).toBeVisible();
    await expect(tool.locator("pre")).toBeHidden();
    await tool.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(tool.locator("pre")).toContainText('"tool_name": "Read"');
    await expect(tool.getByText("app/api/colleges/route.ts", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(tool.locator("pre")).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await prompt.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`conversation-${theme}.png`),
      fullPage: false,
    });
    await reply
      .getByRole("link", { name: "Link to Claude Code outlined the sample API scope" })
      .click();
    await expect(page).toHaveURL(/#sam-response$/);
    await expect(reply).toBeInViewport();
  });
}
