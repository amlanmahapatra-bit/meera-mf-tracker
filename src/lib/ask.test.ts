import { describe, expect, it } from "vitest";
import { askFacts, checkAnswer } from "./ask";
import type { ReportJson } from "./report-types";

const report = {
  weekEnding: "2026-10-10", verdict: "No action needed", verdictReason: "All fine.",
  funds: [{ schemeCode: 1, name: "Axis NASDAQ 100 US Specific Equity Passive FOF - Direct Plan - Growth", slot: "International", status: "green", asOf: "2026-10-09", referenceLabel: "the Nasdaq 100", sentences: ["a", "b", "c"], comparison: { fund: { week: 2.28, month: 6.33, ytd: 29.74 }, split: { total: 2.28, marketPart: 0.2, fundPart: 2.08 } } }],
  marketContext: { indexMoves: [{ name: "Nasdaq 100", week: 0.2 }], news: { headlines: [{ title: "Fed minutes in focus today", source: "ET", url: "" }] }, drivers: [] },
} as unknown as ReportJson;
const facts = askFacts(report);

describe("checkAnswer", () => {
  it("accepts a plain answer built from the facts", () => {
    expect(checkAnswer('Your US fund rose 2.3% this week. The news "Fed minutes in focus today" may have pushed it.', "why did it go up", facts)).toEqual([]);
  });
  it("rejects invented numbers, jargon, advice and made-up headlines", () => {
    expect(checkAnswer("Your US fund rose 9.9% this week.", "q", facts).join()).toContain("9.9");
    expect(checkAnswer("It beat its benchmark.", "q", facts).join()).toContain("plain language");
    expect(checkAnswer("You should sell it.", "q", facts).join()).toContain("advice");
    expect(checkAnswer('The news "Markets crash on surprise vote" explains it.', "q", facts).join()).toContain("not a provided headline");
    expect(checkAnswer("It fell -2.3% this week.", "q", facts).join()).toContain("minus or plus");
  });
  it("allows numbers the question itself used", () => {
    expect(checkAnswer("Over 7 years I do not have the numbers here.", "what about 7 years?", facts)).toEqual([]);
  });
  it("rejects an empty answer", () => {
    expect(checkAnswer("  ", "q", facts)).toHaveLength(1);
  });
});
