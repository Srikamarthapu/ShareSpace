import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepSeekCompactor, redactCompactionText } from "../src/deepseek.js";

const errorLine = "TypeError: counter.value is undefined";
const request = (overrides: Record<string, unknown> = {}) => ({
  summarizationConsent: true,
  redacted: true,
  kind: "tool_output",
  text: `${"Checked src/counter.ts: expected integer values.\n".repeat(100)}${errorLine}`,
  exact_error_excerpts: [errorLine],
  relative_paths: ["src/counter.ts"],
  ...overrides,
});
const provider = (
  content = JSON.stringify({
    summary: "The counter check failed because counter.value was undefined.",
  }),
  finish_reason = "stop",
) => Response.json({ choices: [{ finish_reason, message: { content } }] });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("optional DeepSeek compaction", () => {
  it("requires independent summarization consent and a bounded pre-redacted capture", async () => {
    const fetcher = vi.fn();
    const compact = createDeepSeekCompactor({ apiKey: "synthetic-key", fetch: fetcher });
    expect(await compact(request({ summarizationConsent: false }))).toEqual({
      status: "unavailable",
      reason: "consent_required",
    });
    for (const change of [
      { redacted: false },
      { raw_hook: {} },
      { text: "x".repeat(70 * 1024) },
      { text: "字".repeat(24000) },
      { relative_paths: ["../private.txt"] },
      { relative_paths: [".env.local"] },
      { exact_error_excerpts: ["invented evidence"] },
    ])
      expect(await compact(request(change))).toEqual({
        status: "unavailable",
        reason: "invalid_input",
      });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps exact error/path evidence outside model rewriting and actually reduces stored bytes", async () => {
    const fetcher = vi.fn().mockResolvedValue(provider());
    const result = await createDeepSeekCompactor({ apiKey: "synthetic-key", fetch: fetcher })(
      request(),
    );
    expect(result).toMatchObject({
      status: "compacted",
      model: "deepseek-flash",
      content: { exact_error_excerpts: [errorLine], relative_paths: ["src/counter.ts"] },
    });
    if (result.status !== "compacted") throw new Error("Expected compacted output");
    expect(result.stored_bytes).toBeLessThan(result.input_bytes);
    const call = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(call).toMatchObject({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      stream: false,
    });
    expect(call.tools).toBeUndefined();
  });
  it("applies a second redaction pass before sending to the provider", async () => {
    const fetcher = vi.fn().mockResolvedValue(provider());
    const secret = `sk-${"a".repeat(32)}`;
    await createDeepSeekCompactor({ apiKey: "synthetic-key", fetch: fetcher })(
      request({
        text: `${request().text}\n${secret}\nPRIVATE_VALUE="sensitive literal"\n/Users/Private Name/file.txt`,
      }),
    );
    const body = fetcher.mock.calls[0]![1].body;
    expect(body).not.toMatch(/sensitive literal|Private Name|file\.txt/);
    expect(body).not.toContain(secret);
    expect(body).toContain("[REDACTED]");
  });
  it("does not contact the provider for small inputs or missing credentials", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const fetcher = vi.fn();
    const compact = createDeepSeekCompactor({ fetch: fetcher });
    expect(await compact(request())).toMatchObject({
      status: "fallback",
      reason: "missing_credentials",
    });
    expect(await compact(request({ text: errorLine }))).toMatchObject({
      status: "fallback",
      reason: "not_large_enough",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("falls back to a bounded excerpt on malformed, truncated, credential-like, or extra-field output", async () => {
    for (const response of [
      provider("{"),
      provider(JSON.stringify({ summary: "x".repeat(801) })),
      provider(JSON.stringify({ summary: "ok", exact_error_excerpts: ["fabricated"] })),
      provider(JSON.stringify({ summary: `sk-${"b".repeat(32)}` })),
      provider(JSON.stringify({ summary: "short" }), "length"),
      Response.json({ choices: [] }),
      new Response("x".repeat(17000)),
    ]) {
      const result = await createDeepSeekCompactor({
        apiKey: "synthetic-key",
        fetch: vi.fn().mockResolvedValue(response),
      })(request());
      expect(result).toMatchObject({
        status: "fallback",
        reason: "invalid_output",
        content: { exact_error_excerpts: [errorLine] },
      });
      if (result.status === "fallback")
        expect(result.content.excerpt.length).toBeLessThanOrEqual(1201);
    }
  });
  it("does not claim a storage win if summary plus evidence is larger", async () => {
    const line = "E".repeat(280);
    const input = request({
      text: line,
      exact_error_excerpts: Array(5).fill(line),
      relative_paths: Array.from({ length: 12 }, (_, index) => `src/${index}-${"a".repeat(40)}.ts`),
    });
    const result = await createDeepSeekCompactor({
      apiKey: "synthetic-key",
      fetch: vi.fn().mockResolvedValue(provider(JSON.stringify({ summary: "S".repeat(800) }))),
    })(input);
    expect(result).toMatchObject({ status: "fallback", reason: "not_smaller" });
  });
  it("returns a timed-out fallback even if an injected transport ignores abort", async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const result = await createDeepSeekCompactor({
      apiKey: "synthetic-key",
      timeoutMs: 100,
      fetch: fetcher,
    })(request());
    expect(result).toMatchObject({ status: "fallback", reason: "timeout" });
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  });
  it("does not include provider errors, keys or raw responses in failure results", async () => {
    const result = await createDeepSeekCompactor({
      apiKey: "secret-provider-key",
      fetch: vi
        .fn()
        .mockResolvedValue(Response.json({ error: "secret-provider-diagnostic" }, { status: 500 })),
    })(request());
    expect(result).toMatchObject({ status: "fallback", reason: "provider_error" });
    expect(JSON.stringify(result)).not.toMatch(/secret-provider/);
  });
  it("rejects browser use before parsing data or touching credentials", async () => {
    vi.stubGlobal("window", {});
    expect(await createDeepSeekCompactor({ apiKey: "synthetic-key" })(request())).toEqual({
      status: "unavailable",
      reason: "server_only",
    });
  });
  it("redacts errors deterministically without paraphrasing them", () => {
    expect(redactCompactionText("Error: API_TOKEN=private_value")).toBe("Error: [REDACTED]");
    expect(redactCompactionText(errorLine)).toBe(errorLine);
  });
});
