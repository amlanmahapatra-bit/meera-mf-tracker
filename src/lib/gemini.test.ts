import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERDICTS } from "./config";
import { AI_MODELS, AiError, PROVIDER_RULE, generateReportText, geminiGenerate, parseModels } from "./gemini";
import { buildFacts } from "./gemini-validate";
import { writeReport } from "./report-writer";
import type { ReportInput } from "./report-types";

// These tests use a SIMULATED OpenRouter (no network, no credits). They prove the project's AI rules:
// Google models only, the provider rule on every request, retries with backoff, stop on 402,
// strict checking of the answer, and a template fallback.

const comparison = {
  asOf: "2026-10-09", fund: { week: -2.1, month: -4.0, ytd: 5.0 }, benchmarkName: "Nifty 50", benchmarkMissing: false,
  benchmark: { week: -1.9, month: -3.5, ytd: 6.0 }, gapVsBenchmark: { week: -0.2, month: -0.5, ytd: -1.0 },
  category: { week: -2.0, month: -3.8, ytd: 5.5 }, peersUsed: 3, peersRequested: 3, gapVsCategory: { week: -0.1, month: -0.2, ytd: -0.5 },
  reference: "benchmark" as const, gapVsReference: { week: -0.2, month: -0.5, ytd: -1.0 }, split: { total: -2.1, marketPart: -1.9, fundPart: -0.2 },
};
const input: ReportInput = {
  weekEnding: "2026-10-10", language: "en", verdict: VERDICTS.none, verdictReason: "All your funds are keeping pace.",
  funds: [{ schemeCode: 111, name: "Test Fund", slot: "Large Cap", status: "green", weeksLagging: 0, nav: 50, asOf: "2026-10-09", comparison, referenceLabel: "the Nifty 50", dataNotes: [] }],
  marketContext: { indexMoves: [], news: { source: "gnews", note: "", headlines: [{ title: "Crude oil jumps as Fed holds rates", source: "Reuters", publishedAt: null, url: "" }] }, notices: [] },
  recentStatuses: {},
};
const goodAnswer = {
  funds: [{ schemeCode: 111, sentences: [
    "Your Large Cap fund fell 2.1% this week and 4.0% over the last month, and is up 5.0% since January.",
    "That is 0.5 points behind the Nifty 50 over the last month, and 0.2 points behind the average of 3 similar funds.",
    "Of the 2.1% drop, 1.9% was the whole market and 0.2% was this fund, and I don't know if the news explains the rest.",
  ] }],
  verdict: VERDICTS.none,
  verdictReason: "Your Large Cap fund is only 0.5 points behind the Nifty 50, so nothing needs attention.",
};

const usage = { prompt_tokens: 3000, completion_tokens: 900, cost: 0, cost_details: { upstream_inference_cost: 0.0042 } };
const ok = (obj: unknown, model = "google/gemini-3.7-flash") =>
  new Response(JSON.stringify({ model, choices: [{ message: { content: JSON.stringify(obj) } }], usage }), { status: 200 });
const err = (status: number, message = "x", headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const bodyOf = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);

describe("project AI rules", () => {
  it("only accepts Google models (ids starting with google/)", () => {
    expect(parseModels("google/gemini-3.7-flash,google/gemini-3.8-flash")).toHaveLength(2);
    expect(() => parseModels("openai/gpt-5")).toThrow(/Only Google models/);
    expect(() => parseModels("google/gemini-3.7-flash,anthropic/claude-sonnet")).toThrow(/anthropic/);
    expect(() => parseModels("meta-llama/llama-4")).toThrow();
    expect(() => parseModels(" , ")).toThrow();
  });
  it("the default models are all Google Flash models", () => {
    expect(AI_MODELS.every((m) => m.startsWith("google/gemini-") && m.includes("flash"))).toBe(true);
  });
  it("every request goes to OpenRouter with the provider rule, the key in the Authorization header, and nothing else", async () => {
    fetchMock.mockResolvedValueOnce(ok(goodAnswer));
    await generateReportText(input);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const b = bodyOf(0);
    expect(b.provider.only).toEqual(["google-vertex", "google-ai-studio"]);
    expect(b.provider.allow_fallbacks).toBe(false);
    expect(b.provider.require_parameters).toBe(true); // never routed to an endpoint that ignores the schema
    expect(b.model.startsWith("google/")).toBe(true);
    expect(b.response_format.type).toBe("json_schema");
    expect(b.response_format.json_schema.strict).toBe(true);
    expect(PROVIDER_RULE.allow_fallbacks).toBe(false);
    for (const [u] of fetchMock.mock.calls) expect(String(u)).not.toMatch(/googleapis|anthropic|openai\.com/i);
  });
});

describe("generateReportText (simulated OpenRouter)", () => {
  it("returns the answer, the model that ran and the cost", async () => {
    fetchMock.mockResolvedValueOnce(ok(goodAnswer));
    const r = await generateReportText(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.model).toBe("google/gemini-3.7-flash");
      expect(r.usage.upstreamCostUsd).toBeCloseTo(0.0042);
      expect(r.usage.calls).toBe(1);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once, telling the model what was wrong, then accepts a corrected answer (costs add up)", async () => {
    const bad = JSON.parse(JSON.stringify(goodAnswer));
    bad.funds[0].sentences[0] = "Your Large Cap fund fell 9.9% this week and 4.0% over the last month, and is up 5.0% since January.";
    fetchMock.mockResolvedValueOnce(ok(bad)).mockResolvedValueOnce(ok(goodAnswer));
    const r = await generateReportText(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attempts).toBe(2);
      expect(r.usage.calls).toBe(2);
      expect(r.usage.upstreamCostUsd).toBeCloseTo(0.0084);
    }
    const secondPrompt = bodyOf(1).messages[1].content as string;
    expect(secondPrompt).toContain("rejected");
    expect(secondPrompt).toContain("9.9");
  });

  it("gives up after a second invalid answer", async () => {
    fetchMock.mockImplementation(async () => ok({ ...goodAnswer, verdict: "Maybe sell?" }));
    const r = await generateReportText(input);
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats non-JSON text as a failed attempt", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ model: "google/gemini-3.7-flash", choices: [{ message: { content: "Sure! Here you go" } }], usage }), { status: 200 }));
    expect((await generateReportText(input)).ok).toBe(false);
  });
});

describe("errors, retries and fallback", () => {
  it("retries a busy server (429) with backoff up to 3 times, then moves to the next model", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      const m = JSON.parse(String(init.body)).model;
      return m === "google/gemini-3.7-flash" ? err(429, "rate limited") : ok({ hi: 1 }, m);
    });
    const p = geminiGenerate("sys", "user");
    await vi.advanceTimersByTimeAsync(20_000);
    const out = await p;
    expect(out.model).toBe("google/gemini-3.8-flash");
    const firstModelCalls = fetchMock.mock.calls.filter((c) => JSON.parse(c[1].body).model === "google/gemini-3.7-flash").length;
    expect(firstModelCalls).toBe(4); // 1 try + 3 retries
  });

  it("recovers from a short outage (5xx then success) on the same model", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(err(502)).mockResolvedValueOnce(err(503)).mockImplementation(async () => ok({ hi: 1 }));
    const p = geminiGenerate("sys", "user");
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await p).model).toBe("google/gemini-3.7-flash");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honours the Retry-After header", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(err(429, "slow down", { "retry-after": "5" })).mockImplementation(async () => ok({ hi: 1 }));
    const p = geminiGenerate("sys", "user");
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting
    await vi.advanceTimersByTimeAsync(2_000);
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on 402 (out of credits) without trying other models", async () => {
    fetchMock.mockImplementation(async () => err(402, "insufficient credits"));
    await expect(geminiGenerate("sys", "user")).rejects.toMatchObject({ kind: "out_of_credits" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops immediately when the key is refused (401)", async () => {
    fetchMock.mockImplementation(async () => err(401, "bad key"));
    await expect(geminiGenerate("sys", "user")).rejects.toBeInstanceOf(AiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("moves on when one model rejects the request (400)", async () => {
    fetchMock.mockResolvedValueOnce(err(400, "bad params")).mockImplementation(async (_u: string, init: RequestInit) => ok({ hi: 1 }, JSON.parse(String(init.body)).model));
    expect((await geminiGenerate("sys", "user")).model).toBe("google/gemini-3.8-flash");
  });

  it("reports every problem when all models fail", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => err(503, "no provider"));
    const p = geminiGenerate("sys", "user").catch((e) => e);
    await vi.advanceTimersByTimeAsync(40_000);
    const e = await p;
    expect(e).toBeInstanceOf(AiError);
    expect(e.message).toContain("No Gemini model answered");
  });
});

describe("writeReport falls back to the template", () => {
  it("out of credits -> complete template report that says why", async () => {
    fetchMock.mockImplementation(async () => err(402, "insufficient credits"));
    const w = await writeReport(input);
    expect(w.writer.kind).toBe("template");
    expect(w.writer.reason).toContain("credits are used up");
    expect(w.sentences[111]).toHaveLength(3);
    expect(w.verdict).toBe(VERDICTS.none);
  });

  it("uses the model's words when valid and records which model and the cost", async () => {
    fetchMock.mockResolvedValueOnce(ok(goodAnswer));
    const w = await writeReport(input);
    expect(w.writer.kind).toBe("gemini");
    expect(w.writer.model).toBe("google/gemini-3.7-flash");
    expect(w.writer.reason).toContain("OpenRouter");
    expect(w.writer.reason).toContain("$0.0042");
    expect(w.sentences[111][0]).toContain("fell 2.1%");
  });

  it("never lets the model make the verdict calmer than the numbers when a fund is red", async () => {
    const red: ReportInput = { ...input, verdict: VERDICTS.review, verdictReason: "Two funds are behind.", funds: [{ ...input.funds[0], status: "red" }] };
    fetchMock.mockResolvedValueOnce(ok({ ...goodAnswer, verdict: VERDICTS.none }));
    const w = await writeReport(red);
    expect(w.verdict).toBe(VERDICTS.review);
    expect(w.writer.reason).toContain("calculated verdict was kept");
  });

  it("the facts sent are the computed numbers", () => {
    expect(JSON.stringify(buildFacts(input))).toContain("-2.1");
  });
});
