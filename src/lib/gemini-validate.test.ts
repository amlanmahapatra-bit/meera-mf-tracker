import { describe, expect, it } from "vitest";
import { VERDICTS } from "./config";
import { buildFacts, buildSystemPrompt, numbersIn, validateAnswer } from "./gemini-validate";
import type { ReportInput } from "./report-types";

const comparison = {
  asOf: "2026-10-09",
  fund: { week: -2.1, month: -4.0, ytd: 5.0 },
  benchmarkName: "Nifty 50", benchmarkMissing: false,
  benchmark: { week: -1.9, month: -3.5, ytd: 6.0 },
  gapVsBenchmark: { week: -0.2, month: -0.5, ytd: -1.0 },
  category: { week: -2.0, month: -3.8, ytd: 5.5 }, peersUsed: 3, peersRequested: 3,
  gapVsCategory: { week: -0.1, month: -0.2, ytd: -0.5 },
  reference: "benchmark" as const,
  gapVsReference: { week: -0.2, month: -0.5, ytd: -1.0 },
  split: { total: -2.1, marketPart: -1.9, fundPart: -0.2 },
};
const input: ReportInput = {
  weekEnding: "2026-10-10", language: "en", verdict: VERDICTS.none, verdictReason: "All good.",
  funds: [{ schemeCode: 111, name: "Test Fund", slot: "Large Cap", status: "green", weeksLagging: 0, nav: 50, asOf: "2026-10-09", comparison, referenceLabel: "the Nifty 50", dataNotes: [] }],
  marketContext: { indexMoves: [{ name: "Nifty 50", week: -1.9, month: -3.5, ytd: 6, asOf: "2026-10-09" }], news: { source: "gnews", note: "", headlines: [{ title: "Crude oil jumps as Fed holds rates", source: "Reuters", publishedAt: null, url: "" }] }, notices: [] },
  recentStatuses: { 111: [{ weekEnding: "2026-10-03", status: "green" }] },
};
const facts = buildFacts(input);
const good = () => ({
  funds: [{ schemeCode: 111, sentences: [
    "Your Large Cap fund fell 2.1% this week, and is up 5.0% since January.",
    "Over the last month it did a little worse than the Nifty 50, and a little worse than 3 similar funds.",
    "Most of the drop came from the whole market, and I do not know of any news that explains the rest.",
  ] }],
  verdict: VERDICTS.none,
  verdictReason: "Your Large Cap fund is only a little behind the market, so nothing needs attention.",
});

describe("validateAnswer", () => {
  it("accepts a well-formed, honest answer", () => {
    const r = validateAnswer(good(), input, facts);
    expect(r.ok).toBe(true);
  });
  it("rejects an invented number", () => {
    const a = good();
    a.funds[0].sentences[0] = "Your Large Cap fund fell 7.7% this week and 4.0% over the last month, and is up 5.0% since January.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("7.7");
  });
  it("rejects a verdict that is not one of the three exact strings", () => {
    const a = { ...good(), verdict: "Everything is fine" };
    expect(validateAnswer(a, input, facts).ok).toBe(false);
  });
  it("rejects the wrong number of sentences", () => {
    const a = good();
    (a.funds[0].sentences as string[]).pop();
    expect(validateAnswer(a, input, facts).ok).toBe(false);
  });
  it("rejects two sentences squeezed into one slot", () => {
    const a = good();
    a.funds[0].sentences[1] = "It did worse than the Nifty 50. It also did worse than similar funds.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("exactly one sentence");
  });
  it("rejects jargon", () => {
    const a = good();
    a.funds[0].sentences[1] = "It underperformed the benchmark over the last month.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/plain language/);
  });
  it("rejects minus and plus signs in front of numbers", () => {
    const a = good();
    a.funds[0].sentences[0] = "Your Large Cap fund moved -2.1% this week, and is up 5.0% since January.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("minus or plus sign");
    const b = good();
    b.funds[0].sentences[0] = "Your Large Cap fund rose +2.1% this week, and is up 5.0% since January.";
    expect(validateAnswer(b, input, facts).ok).toBe(false);
  });
  it("does not mistake dashes and ranges for signs", () => {
    const a = good();
    a.funds[0].sentences[1] = "Over the last month it did a little worse than the Nifty 50 - and a little worse than 3 similar funds.";
    expect(validateAnswer(a, input, facts).ok).toBe(true);
  });
  it("rejects numbers with more than one decimal place", () => {
    const a = good();
    a.funds[0].sentences[0] = "Your Large Cap fund fell 2.10% this week, and is up 5.0% since January.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("too many decimals");
  });
  it("requires sentence 3 to say whether the move came from the market or the fund when a split exists", () => {
    const a = good();
    a.funds[0].sentences[2] = "I do not know what caused it.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("whole market or from the fund");
  });
  it("does not demand a split for a fund that has none (the debt fund)", () => {
    const noSplit = { ...input, funds: [{ ...input.funds[0], comparison: { ...input.funds[0].comparison, split: null } }] };
    const a = good();
    a.funds[0].sentences[2] = "I do not know what caused it.";
    expect(validateAnswer(a, noSplit, buildFacts(noSplit)).ok).toBe(true);
  });
  it("rejects words that are not plain language: index, points, peers", () => {
    for (const bad of ["It did better than the Nifty 50 index.", "It was 0.5 points ahead.", "It beat its peers."]) {
      const a = good();
      a.funds[0].sentences[1] = bad;
      expect(validateAnswer(a, input, facts).ok).toBe(false);
    }
  });
  it("still allows a fund's own name (even with 'Index Fund' or a number in it) without counting it", () => {
    const named = { ...input, funds: [{ ...input.funds[0], name: "Bandhan Nifty 50 Index Fund" }] };
    const a = good();
    a.funds[0].sentences[0] = "Your Bandhan Nifty 50 Index Fund fell 2.1% this week, and is up 5.0% since January.";
    expect(validateAnswer(a, named, buildFacts(named)).ok).toBe(true);
  });
  it("rejects sentences that are too long", () => {
    const a = good();
    a.funds[0].sentences[1] = "Over the last month it did a little worse than the market and a little worse than the similar funds and also a little worse than most other funds that people usually compare it with.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("too long");
  });
  it("rejects sentences with too many numbers", () => {
    const a = good();
    a.funds[0].sentences[0] = "Your Large Cap fund fell 2.1% this week, rose 4.0% this month, and is up 5.0% since January.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("too many numbers");
  });
  it("rejects investment advice", () => {
    const a = good();
    a.funds[0].sentences[2] = "You should sell this fund because the market dropped.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toMatch(/advice/);
  });
  it("rejects a quoted headline that was not provided", () => {
    const a = good();
    a.funds[0].sentences[2] = "Most of the drop came from the whole market, and \"Sensex crashes after surprise election result\" explains it.";
    const r = validateAnswer(a, input, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join(" ")).toContain("not one of the provided headlines");
  });
  it("rejects missing or duplicated funds", () => {
    const a = good();
    a.funds[0].schemeCode = 999;
    expect(validateAnswer(a, input, facts).ok).toBe(false);
  });
  it("allows an honest 'I don't know' as long as the split is still stated", () => {
    const a = good();
    a.funds[0].sentences[2] = "Almost all of the drop came from the whole market, and I do not know of a news event that explains it.";
    expect(validateAnswer(a, input, facts).ok).toBe(true);
  });
  it("rejects non-objects", () => {
    expect(validateAnswer(null, input, facts).ok).toBe(false);
    expect(validateAnswer("hello", input, facts).ok).toBe(false);
  });
});

describe("prompt and helpers", () => {
  it("numbersIn finds decimals and ignores signs", () => {
    expect(numbersIn("fell -2.1% and rose 1,234.5")).toEqual([2.1, 1234.5]);
  });
  it("the facts carry code-decided comparison wording from the monthly gaps", () => {
    const f = (facts.funds[0] as { monthComparison: { withComparedWith: string; withSimilarFunds: string } }).monthComparison;
    expect(f.withComparedWith).toBe("a little worse than"); // month gap -0.5 vs the index
    expect(f.withSimilarFunds).toBe("a little worse than"); // month gap -0.2 vs similar funds
  });
  it("the facts contain only rounded numbers and no raw price histories", () => {
    const text = JSON.stringify(facts);
    expect(text).toContain("fundReturnsPercent");
    expect(text.length).toBeLessThan(6000);
  });
  it("the system prompt states the hard rules", () => {
    const p = buildSystemPrompt("en");
    expect(p).toContain("EXACTLY three SHORT sentences");
    expect(p).toContain("NEVER use these words");
    expect(p).toContain("Never give investment advice");
  });
  it("Hinglish prompt asks for Hinglish", () => {
    expect(buildSystemPrompt("hinglish")).toContain("Hinglish");
  });
});
