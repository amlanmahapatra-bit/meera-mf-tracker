import { describe, expect, it } from "vitest";
import { alignedReturns, compareFund, convertToInr, matchedReturns, peerAverageMatched } from "./comparison";
import type { PeerAverage, Point, Returns } from "./returns";

const ret = (week: number | null, month: number | null, ytd: number | null, asOf = "2026-10-09"): Returns => ({
  asOf,
  latestValue: 100,
  week: week === null ? null : { pct: week, baseDate: "x", baseValue: 1 },
  month: month === null ? null : { pct: month, baseDate: "x", baseValue: 1 },
  ytd: ytd === null ? null : { pct: ytd, baseDate: "x", baseValue: 1 },
});
const peers = (week: number | null, month: number | null, ytd: number | null, used = 3, asked = 3): PeerAverage => ({
  week, month, ytd, peersUsed: used, peersRequested: asked,
});

describe("compareFund", () => {
  it("computes gaps against benchmark and category", () => {
    const c = compareFund({
      fundReturns: ret(-2.1, -4, 5),
      benchmarkName: "Nifty 50",
      benchmarkReturns: ret(-1.9, -3.5, 6),
      peers: peers(-2.0, -3.8, 5.5),
    });
    expect(c.gapVsBenchmark!.week).toBeCloseTo(-0.2);
    expect(c.gapVsBenchmark!.month).toBeCloseTo(-0.5);
    expect(c.gapVsBenchmark!.ytd).toBeCloseTo(-1.0);
    expect(c.gapVsCategory.week).toBeCloseTo(-0.1);
    expect(c.reference).toBe("benchmark");
    expect(c.gapVsReference.month).toBeCloseTo(-0.5);
  });

  it("splits the week into market part and fund part that add up to the total", () => {
    const c = compareFund({
      fundReturns: ret(-2.1, 0, 0),
      benchmarkName: "Nifty 50",
      benchmarkReturns: ret(-1.9, 0, 0),
      peers: peers(null, null, null, 0, 0),
    });
    expect(c.split!.marketPart).toBeCloseTo(-1.9);
    expect(c.split!.fundPart).toBeCloseTo(-0.2);
    expect(c.split!.marketPart + c.split!.fundPart).toBeCloseTo(c.split!.total);
  });

  it("debt fund (no benchmark): judged against the category average, no split", () => {
    const c = compareFund({ fundReturns: ret(0.1, -0.2, 3.7), benchmarkName: null, benchmarkReturns: null, peers: peers(0.05, -0.1, 3.9, 4, 4) });
    expect(c.benchmark).toBeNull();
    expect(c.benchmarkMissing).toBe(false);
    expect(c.reference).toBe("category");
    expect(c.gapVsReference.month).toBeCloseTo(-0.1);
    expect(c.split).toBeNull();
    expect(c.peersUsed).toBe(4);
  });

  it("benchmark configured but its data is down: falls back to category and says so", () => {
    const c = compareFund({ fundReturns: ret(1, 1, 1), benchmarkName: "Nifty 50", benchmarkReturns: null, peers: peers(0.5, 0.5, 0.5) });
    expect(c.benchmarkMissing).toBe(true);
    expect(c.reference).toBe("category");
    expect(c.split).toBeNull();
  });

  it("no benchmark and no peers: reference is none and gaps are null", () => {
    const c = compareFund({ fundReturns: ret(1, 1, 1), benchmarkName: null, benchmarkReturns: null, peers: peers(null, null, null, 0, 0) });
    expect(c.reference).toBe("none");
    expect(c.gapVsReference).toEqual({ week: null, month: null, ytd: null });
  });

  it("keeps null windows null instead of inventing numbers", () => {
    const c = compareFund({ fundReturns: ret(1, null, 3), benchmarkName: "X", benchmarkReturns: ret(0.5, 2, null), peers: peers(null, null, null, 0, 0) });
    expect(c.gapVsBenchmark!.month).toBeNull();
    expect(c.gapVsBenchmark!.ytd).toBeNull();
    expect(c.gapVsBenchmark!.week).toBeCloseTo(0.5);
  });
});

describe("convertToInr", () => {
  it("multiplies by the rupee rate of the same or the previous day", () => {
    const idx: Point[] = [{ date: "2026-10-08", value: 100 }, { date: "2026-10-09", value: 110 }];
    const fx: Point[] = [{ date: "2026-10-07", value: 80 }, { date: "2026-10-09", value: 90 }];
    expect(convertToInr(idx, fx)).toEqual([{ date: "2026-10-08", value: 8000 }, { date: "2026-10-09", value: 9900 }]);
  });
  it("skips days with no usable rate", () => {
    const idx: Point[] = [{ date: "2026-10-09", value: 100 }];
    expect(convertToInr(idx, [])).toEqual([]);
    expect(convertToInr(idx, [{ date: "2026-01-01", value: 80 }])).toEqual([]); // rate far too old
  });
});

describe("alignedReturns", () => {
  const s: Point[] = [];
  for (let d = 1; d <= 30; d++) s.push({ date: `2026-09-${String(d).padStart(2, "0")}`, value: 100 + d });
  it("uses the index value as of the fund's date, not the index's newest date", () => {
    expect(alignedReturns(s, "2026-09-20")!.asOf).toBe("2026-09-20");
  });
  it("applies the lag (US index vs Indian NAV date)", () => {
    expect(alignedReturns(s, "2026-09-20", 1)!.asOf).toBe("2026-09-19");
  });
  it("returns null when the series is too stale for that date", () => {
    expect(alignedReturns(s, "2026-10-20")).toBeNull();
  });
});

describe("matchedReturns (same periods as the fund)", () => {
  // Fund: latest Fri 9 Oct, week base Thu 1 Oct because 2 Oct was an Indian holiday.
  const fund: Returns = {
    asOf: "2026-10-09",
    latestValue: 1,
    week: { pct: 0, baseDate: "2026-10-01", baseValue: 1 },
    month: { pct: 0, baseDate: "2026-09-09", baseValue: 1 },
    ytd: null,
  };
  const idx: Point[] = [
    { date: "2026-09-09", value: 100 },
    { date: "2026-10-01", value: 110 },
    { date: "2026-10-02", value: 111 }, // index traded on the Indian holiday
    { date: "2026-10-09", value: 121 },
  ];
  it("uses the fund's own start date, even if the index had an extra trading day", () => {
    const r = matchedReturns(idx, fund)!;
    expect(r.week!.baseDate).toBe("2026-10-01");
    expect(r.week!.pct).toBeCloseTo((121 / 110 - 1) * 100, 10);
    expect(r.month!.pct).toBeCloseTo(21, 10);
  });
  it("keeps a window null when the fund has none", () => {
    expect(matchedReturns(idx, fund)!.ytd).toBeNull();
  });
  it("shifts every date back by the lag for overseas markets", () => {
    const us: Point[] = [
      { date: "2026-09-08", value: 100 },
      { date: "2026-09-30", value: 110 },
      { date: "2026-10-08", value: 121 },
    ];
    const r = matchedReturns(us, fund, 1)!;
    expect(r.asOf).toBe("2026-10-08");
    expect(r.week!.baseDate).toBe("2026-09-30");
    expect(r.week!.pct).toBeCloseTo(10, 10);
  });
  it("returns null when the series is too stale", () => {
    expect(matchedReturns([{ date: "2026-06-01", value: 1 }, { date: "2026-06-02", value: 2 }], fund)).toBeNull();
  });
});

describe("peerAverageMatched", () => {
  const fund: Returns = { asOf: "2026-10-09", latestValue: 1, week: { pct: 0, baseDate: "2026-10-02", baseValue: 1 }, month: null, ytd: null };
  it("skips peers that failed (null series) and counts them", () => {
    const up: Point[] = [{ date: "2026-10-02", value: 100 }, { date: "2026-10-09", value: 102 }];
    const a = peerAverageMatched([up, null, up], fund);
    expect(a.peersRequested).toBe(3);
    expect(a.peersUsed).toBe(2);
    expect(a.week).toBeCloseTo(2);
  });
});
