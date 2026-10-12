import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERDICTS } from "./config";
import { generateReportText, geminiGenerate } from "./gemini";
import { buildFacts } from "./gemini-validate";
import { writeReport } from "./report-writer";
import type { ReportInput } from "./report-types";

// These tests use a SIMULATED Gemini (no network, no quota). They prove our handling of good answers,
// bad answers, busy servers and a used-up daily limit.

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
const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const err = (status: number, message: string) => new Response(JSON.stringify({ error: { code: status, message } }), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("generateReportText (simulated Gemini)", () => {
  it("returns the answer when Gemini's first reply is valid", async () => {
    fetchMock.mockResolvedValueOnce(ok(goodAnswer));
    const r = await generateReportText(input);
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The request carries a response schema and the facts, never the Anthropic API.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("generativelanguage.googleapis.com");
    expect(String(url)).not.toMatch(/anthropic/i);
    expect(JSON.parse(init.body).generationConfig.responseSchema).toBeDefined();
  });

  it("retries once, telling Gemini what was wrong, then accepts a corrected answer", async () => {
    const bad = JSON.parse(JSON.stringify(goodAnswer));
    bad.funds[0].sentences[0] = "Your Large Cap fund fell 9.9% this week and 4.0% over the last month, and is up 5.0% since January.";
    fetchMock.mockResolvedValueOnce(ok(bad)).mockResolvedValueOnce(ok(goodAnswer));
    const r = await generateReportText(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.attempts).toBe(2);
    const secondPrompt = JSON.parse(fetchMock.mock.calls[1][1].body).contents[0].parts[0].text as string;
    expect(secondPrompt).toContain("rejected");
    expect(secondPrompt).toContain("9.9");
  });

  it("gives up after a second invalid answer", async () => {
    const bad = { ...goodAnswer, verdict: "Maybe sell?" };
    fetchMock.mockImplementation(async () => ok(bad)); // a fresh reply each time
    const r = await generateReportText(input);
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats non-JSON text as a failed attempt", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Sure! Here you go" }] } }] }), { status: 200 }));
    const r = await generateReportText(input);
    expect(r.ok).toBe(false);
  });
});

describe("model fallback and limits", () => {
  it("moves to the next model when the first is busy (503)", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(err(503, "high demand")).mockResolvedValueOnce(ok({ hello: 1 }));
    const p = geminiGenerate("sys", "user");
    await vi.advanceTimersByTimeAsync(2_000);
    const out = await p;
    vi.useRealTimers();
    expect(out.model).not.toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).not.toBe(String(fetchMock.mock.calls[1][0])); // a different model
  });

  it("stops asking a model whose free daily limit is used up, and says so", async () => {
    fetchMock.mockImplementation(async () => err(429, "Quota exceeded ... GenerateRequestsPerDayPerProjectPerModel-FreeTier ... Please retry in 10h38m48.2s."));
    const t0 = Date.now();
    await expect(geminiGenerate("sys", "user")).rejects.toThrow(/free limit is used up/);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3); // one try per model, no hammering
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});

describe("writeReport falls back to the template", () => {
  it("returns a complete template report when Gemini is unusable", async () => {
    fetchMock.mockImplementation(async () => err(429, "GenerateRequestsPerDayPerProjectPerModel-FreeTier"));
    const w = await writeReport(input);
    expect(w.writer.kind).toBe("template");
    expect(w.writer.reason).toContain("Gemini could not be used");
    expect(w.sentences[111]).toHaveLength(3);
    expect(w.verdict).toBe(VERDICTS.none);
  });

  it("uses Gemini's words when valid and records the model", async () => {
    fetchMock.mockResolvedValueOnce(ok(goodAnswer));
    const w = await writeReport(input);
    expect(w.writer.kind).toBe("gemini");
    expect(w.sentences[111][0]).toContain("fell 2.1%");
  });

  it("never lets Gemini make the verdict calmer than the numbers when a fund is red", async () => {
    const red: ReportInput = { ...input, verdict: VERDICTS.review, verdictReason: "Two funds are behind.", funds: [{ ...input.funds[0], status: "red" }] };
    const calm = { ...goodAnswer, verdict: VERDICTS.none };
    fetchMock.mockResolvedValueOnce(ok(calm));
    const w = await writeReport(red);
    expect(w.verdict).toBe(VERDICTS.review);
    expect(w.writer.reason).toContain("calculated verdict was kept");
  });

  it("the facts sent to Gemini are the computed numbers", () => {
    expect(JSON.stringify(buildFacts(input))).toContain("-2.1");
  });
});
