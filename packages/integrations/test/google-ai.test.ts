import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvedContextRequestSchema,
  createSummarizeApprovedContext,
  type GeminiGenerationParameters,
} from "../src/index.js";

const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;

function request(overrides: Record<string, unknown> = {}) {
  return {
    callerApproved: true,
    purpose: "Prepare a short handoff",
    context: [
      {
        source_id: uuid(1),
        kind: "decision",
        label: "Builder decision",
        text: "Keep the first release advisory and never treat provider failure as a clear result.",
      },
    ],
    ...overrides,
  };
}

function output(sourceId = uuid(1)) {
  return JSON.stringify({
    summary: "The first release gives advisory guidance and treats provider failures as unknown.",
    labels: [
      {
        category: "decision",
        text: "Provider failure must not become a clear result.",
        evidence_ids: [sourceId],
      },
    ],
    caveats: ["This summary covers only the supplied decision item."],
  });
}

const savedGeminiKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (savedGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGeminiKey;
});

describe("approved context schema", () => {
  it("requires explicit approval and bounds the context payload", () => {
    expect(approvedContextRequestSchema.safeParse(request()).success).toBe(true);
    expect(approvedContextRequestSchema.safeParse(request({ history: ["unbounded transcript"] })).success).toBe(false);
    expect(approvedContextRequestSchema.safeParse(request({ context: Array(21).fill(request().context[0]) })).success).toBe(false);
    expect(approvedContextRequestSchema.safeParse(request({ context: [{ ...request().context[0], text: "x".repeat(4_001) }] })).success).toBe(false);
  });
});

describe("Google AI Studio summary helper", () => {
  it("requires caller approval and credentials before invoking a client", async () => {
    const generateContent = vi.fn(async () => ({ text: output() }));
    const summarize = createSummarizeApprovedContext({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      client: { generateContent },
    });

    await expect(summarize(request({ callerApproved: false }))).resolves.toEqual({
      status: "unavailable",
      reason: "caller_approval_required",
    });
    expect(generateContent).not.toHaveBeenCalled();

    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const noCredentials = createSummarizeApprovedContext({ model: "gemini-3-flash-preview", client: { generateContent } });
    await expect(noCredentials(request())).resolves.toEqual({ status: "unavailable", reason: "missing_credentials" });
    expect(generateContent).not.toHaveBeenCalled();
    if (previousKey !== undefined) process.env.GEMINI_API_KEY = previousKey;
  });

  it("sends only approved bounded items and validates labels, caveats, and cited IDs", async () => {
    let sent: GeminiGenerationParameters | undefined;
    const summarize = createSummarizeApprovedContext({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      client: {
        generateContent: async (parameters) => {
          sent = parameters;
          return { text: output() };
        },
      },
    });

    const result = await summarize(request());
    expect(result).toMatchObject({
      status: "available",
      model: "gemini-3-flash-preview",
      result: { labels: [{ category: "decision", evidence_ids: [uuid(1)] }], caveats: expect.any(Array) },
    });
    expect(sent?.config.responseMimeType).toBe("application/json");
    expect(sent?.config.responseJsonSchema).toBeDefined();
    expect(sent?.contents).toContain(uuid(1));
    expect(sent?.contents).not.toContain("history");

    const invalidCitation = createSummarizeApprovedContext({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      client: { generateContent: async () => ({ text: output(uuid(99)) }) },
    });
    await expect(invalidCitation(request())).resolves.toEqual({ status: "unavailable", reason: "invalid_output" });
  });

  it("returns unavailable on timeout, provider errors, invalid JSON, and oversized input", async () => {
    const timeout = createSummarizeApprovedContext({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      timeoutMs: 100,
      client: { generateContent: () => new Promise(() => undefined) },
    });
    await expect(timeout(request())).resolves.toEqual({ status: "unavailable", reason: "timeout" });

    const providerError = createSummarizeApprovedContext({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      client: { generateContent: async () => Promise.reject(new Error("private provider details")) },
    });
    await expect(providerError(request())).resolves.toEqual({ status: "unavailable", reason: "provider_error" });

    const invalidJson = createSummarizeApprovedContext({
      model: "gemini-3-flash-preview",
      apiKey: "test-key",
      client: { generateContent: async () => ({ text: "not json" }) },
    });
    await expect(invalidJson(request())).resolves.toEqual({ status: "unavailable", reason: "invalid_output" });

    await expect(providerError(request({ purpose: "x", context: Array(21).fill(request().context[0]) }))).resolves.toEqual({
      status: "unavailable",
      reason: "invalid_input",
    });
  });
});
