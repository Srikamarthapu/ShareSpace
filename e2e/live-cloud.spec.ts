import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const credentialPath = process.env.SHARESPACE_DEMO_TEST_CREDENTIALS;
type Credentials = {
  owner: { email: string; password: string };
  teammate: { email: string; password: string };
  supabase: { url: string; key: string };
  repository: string;
};
const credentials: Credentials | null = credentialPath
  ? JSON.parse(readFileSync(credentialPath, "utf8"))
  : null;
// This opt-in test uses actual accounts and mutation endpoints. Keep credentials and token
// responses out of Playwright traces, screenshots, reports, and source control.
test.use({ trace: "off", screenshot: "off", video: "off" });

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in to workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/live/);
  // URL navigation can complete before the workspace hydrates. Wait for a real view
  // before deciding whether this account needs onboarding.
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
}
async function edge(request: APIRequestContext, name: string, body: unknown, token?: string) {
  const response = await request.post(`${credentials!.supabase.url}/functions/v1/${name}`, {
    headers: {
      apikey: credentials!.supabase.key,
      ...(token ? { "x-sharespace-device-token": token } : {}),
    },
    data: body,
  });
  expect(response.ok(), `${name} response status ${response.status()}`).toBe(true);
  return response.json();
}

test("real users share a session, enforce privacy, delete history and revoke a device", async ({
  browser,
  request,
}, testInfo) => {
  test.skip(
    !credentials,
    "Set SHARESPACE_DEMO_TEST_CREDENTIALS to an ignored credentials file to run real cloud mutations.",
  );
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "One cloud run avoids concurrent writes to the same test team.",
  );
  test.setTimeout(180_000);
  const ownerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const teammateContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const owner = await ownerContext.newPage();
  const teammate = await teammateContext.newPage();
  try {
    await signIn(owner, credentials!.owner);
    if (
      await owner.getByRole("heading", { name: "Welcome to ShareSpace", exact: true }).isVisible()
    ) {
      await owner.getByLabel("Team name", { exact: true }).fill("ShareSpace live verification");
      await owner.getByLabel("GitHub repository", { exact: true }).fill(credentials!.repository);
      await owner.getByRole("button", { name: "Create team", exact: true }).click();
    } else await owner.goto("/live?view=team");
    await expect(owner.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();
    await owner.getByRole("button", { name: "Create new invite link", exact: true }).click();
    const inviteInput = owner.getByLabel("Invite link", { exact: true });
    await expect(inviteInput).toHaveValue(/\/join\/ssi-/);
    const invite = await inviteInput.inputValue();
    await signIn(teammate, credentials!.teammate);
    await teammate.goto(invite);
    await teammate.getByRole("button", { name: "Join team", exact: true }).click();
    await expect(teammate.getByRole("heading", { name: "Your team", exact: true })).toBeVisible();

    await owner.goto("/live?view=settings");
    const sharing = owner.getByLabel("Share future agent sessions with my team", { exact: true });
    await expect(sharing).toBeVisible();
    if (!(await sharing.isChecked())) await sharing.check();
    await expect(sharing).toBeChecked();
    const pause = owner.getByLabel("Pause new event uploads", { exact: true });
    if (await pause.isChecked()) await pause.uncheck();
    const repositoryName = await owner.locator("#sharing-repository option:checked").textContent();
    const deviceName = `Browser verification ${randomUUID().slice(0, 8)}`;
    const pairing = await edge(request, "devices", {
      action: "start_pairing",
      agent: "claude_code",
      agent_version: null,
      device_name: deviceName,
      repository_name: repositoryName,
      capabilities: {
        event_capture: "partial",
        overlap_check: "unsupported",
        warning_delivery: "unsupported",
      },
    });
    await owner.goto(`/live?view=devices&code=${pairing.user_code}`);
    await owner.getByRole("button", { name: "Review connection", exact: true }).click();
    await owner.getByRole("button", { name: "Approve device", exact: true }).click();
    await expect(owner.getByRole("status")).toContainText("Device approved");
    const paired = await edge(request, "devices", {
      action: "poll_pairing",
      pairing_id: pairing.pairing_id,
      poll_secret: pairing.poll_secret,
    });
    expect(paired.status).toBe("approved");
    const sessionId = randomUUID();
    const run = `Live verification ${sessionId.slice(0, 8)}`;
    const occurred = new Date().toISOString();
    const events = [
      {
        event_id: randomUUID(),
        session_id: sessionId,
        sequence: 0,
        occurred_at: occurred,
        redacted: false,
        truncated: false,
        kind: "session.started",
        payload: {
          branch: "demo/verification",
          agent_version: null,
          capture_limitations: [
            "Explicit verification events; no coding agent was executed by this browser test.",
          ],
        },
      },
      {
        event_id: randomUUID(),
        session_id: sessionId,
        sequence: 1,
        occurred_at: occurred,
        redacted: false,
        truncated: false,
        kind: "user.message",
        payload: { text: run, branch: "demo/verification" },
      },
      {
        event_id: randomUUID(),
        session_id: sessionId,
        sequence: 2,
        occurred_at: occurred,
        redacted: false,
        truncated: false,
        kind: "assistant.message",
        payload: { text: "This event travelled through the real authenticated ingest endpoint." },
      },
    ];
    const ingested = await edge(request, "ingest", { events }, paired.device_token);
    expect(ingested.results.every((item: { outcome: string }) => item.outcome === "accepted")).toBe(
      true,
    );
    await teammate.goto(`/live?view=sessions&session=${sessionId}`);
    await expect(teammate.getByRole("heading", { name: run, exact: true })).toBeVisible();
    await expect(
      teammate.getByText("This event travelled through the real authenticated ingest endpoint.", {
        exact: true,
      }),
    ).toBeVisible();
    await owner.goto(`/live?view=sessions&session=${sessionId}`);
    await owner.getByRole("button", { name: "Make private", exact: true }).click();
    await expect(
      teammate.getByRole("heading", { name: "Session unavailable", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await owner.getByRole("button", { name: "Share session", exact: true }).click();
    await expect(teammate.getByRole("heading", { name: run, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await owner.getByRole("button", { name: "Delete shared history", exact: true }).click();
    await owner.getByRole("button", { name: "Confirm deletion", exact: true }).click();
    await expect(
      owner.getByRole("heading", { name: "History removed", exact: true }),
    ).toBeVisible();
    await expect(
      teammate.getByRole("heading", { name: "History removed", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      teammate.getByText("This event travelled through the real authenticated ingest endpoint.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await owner.goto("/live?view=devices");
    owner.once("dialog", (dialog) => dialog.accept());
    await owner
      .getByRole("listitem")
      .filter({ has: owner.getByText(deviceName, { exact: true }) })
      .filter({ has: owner.getByRole("button", { name: "Revoke device", exact: true }) })
      .last()
      .getByRole("button", { name: "Revoke device", exact: true })
      .click();
    await expect(owner.getByRole("status")).toContainText("Device revoked");
    const revoked = await request.post(`${credentials!.supabase.url}/functions/v1/ingest`, {
      headers: {
        apikey: credentials!.supabase.key,
        "x-sharespace-device-token": paired.device_token,
      },
      data: { events },
    });
    expect(revoked.status()).toBe(401);
    const rejection = await revoked.json();
    expect(rejection.error.code).toBe("device_revoked");
  } finally {
    await ownerContext.close();
    await teammateContext.close();
  }
});
