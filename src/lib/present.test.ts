import { describe, expect, it } from "vitest";
import { comparisonRows, gapPhrase, shortName } from "./present";
import type { FundComparison } from "./comparison";

describe("shortName", () => {
  it.each([
    ["Bandhan Nifty 50 Index Fund - Direct Plan - Growth", "Bandhan Nifty 50 Index Fund"],
    ["Axis NASDAQ 100 US Specific Equity Passive FOF - Direct Plan - Growth Option", "Axis NASDAQ 100 US Specific Equity Passive FOF"],
    ["HDFC Short Term Fund - Direct Plan - Growth Option", "HDFC Short Term Fund"],
    ["Kotak Short Term Fund - Direct Plan - (Growth)", "Kotak Short Term Fund"],
    ["Some Fund Direct Growth", "Some Fund"],
    ["Plain Name", "Plain Name"],
  ])("%s", (input, out) => expect(shortName(input)).toBe(out));
});

describe("gapPhrase", () => {
  it("says about the same for tiny gaps", () => expect(gapPhrase(0.1)).toEqual({ text: "About the same", tone: "flat" }));
  it("says better / worse in everyday words", () => {
    expect(gapPhrase(1.6)).toEqual({ text: "1.6% better", tone: "good" });
    expect(gapPhrase(-1.04)).toEqual({ text: "1.0% worse", tone: "bad" });
  });
  it("handles missing", () => expect(gapPhrase(null).tone).toBe("na"));
});

const base = (over: Partial<FundComparison>): FundComparison => ({
  asOf: "2026-10-09", fund: { week: 1, month: 1, ytd: 1 }, benchmarkName: "Nifty 50", benchmarkMissing: false,
  benchmark: { week: 1, month: 1, ytd: 1 }, gapVsBenchmark: { week: 0, month: 0.05, ytd: 0 }, category: { week: 1, month: 1, ytd: 1 },
  peersUsed: 3, peersRequested: 3, gapVsCategory: { week: 0, month: 1.2, ytd: 0 }, reference: "benchmark",
  gapVsReference: { week: 0, month: 0.05, ytd: 0 }, split: null, ...over,
});

describe("comparisonRows", () => {
  it("lists the index and the similar funds", () => {
    const r = comparisonRows(base({}));
    expect(r.map((x) => x.label)).toEqual(["the Nifty 50", "the average of 3 similar funds"]);
    expect(r[0].phrase.text).toBe("About the same");
    expect(r[1].phrase.text).toBe("1.2% better");
  });
  it("debt fund: only similar funds", () => {
    const r = comparisonRows(base({ benchmarkName: null, benchmark: null, gapVsBenchmark: null, peersUsed: 1 }));
    expect(r.map((x) => x.label)).toEqual(["the average of 1 similar fund"]);
  });
  it("index configured but missing data: row says not available", () => {
    const r = comparisonRows(base({ benchmark: null, gapVsBenchmark: null, benchmarkMissing: true }));
    expect(r[0].phrase.tone).toBe("na");
  });
  it("no similar funds set: no similar row", () => {
    expect(comparisonRows(base({ peersRequested: 0, peersUsed: 0 })).map((x) => x.key)).toEqual(["index"]);
  });
});

import { latestPrice } from "./present";
describe("latestPrice", () => {
  const prices = [{ date: "2026-10-09", value: 100 }, { date: "2026-10-13", value: 101 }, { date: "2026-10-14", value: 102 }];
  it("returns the newest saved price and the move since the report", () => {
    const r = latestPrice(prices, 100, "2026-10-09")!;
    expect(r.date).toBe("2026-10-14");
    expect(r.nav).toBe(102);
    expect(r.sinceReportPct).toBeCloseTo(2, 5);
  });
  it("returns null when nothing is newer than the report", () => {
    expect(latestPrice(prices, 102, "2026-10-14")).toBeNull();
    expect(latestPrice([], 100, "2026-10-09")).toBeNull();
  });
});
