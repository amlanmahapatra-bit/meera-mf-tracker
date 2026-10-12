import { describe, expect, it } from "vitest";
import {
  addDays,
  averagePeerReturns,
  cleanSeries,
  computeReturns,
  endOfPreviousYear,
  onOrBefore,
  oneMonthBefore,
  parseMfapiDate,
  seriesFromMfapi,
  type Point,
} from "./returns";

/** Builds weekday-only daily points (no weekends), value rises 1 per weekday from `start`. */
function weekdays(from: string, to: string, startValue = 100): Point[] {
  const out: Point[] = [];
  let v = startValue;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push({ date: d, value: v++ });
  }
  return out;
}

describe("date helpers", () => {
  it("parses mfapi DD-MM-YYYY dates", () => {
    expect(parseMfapiDate("09-10-2026")).toBe("2026-10-09");
  });
  it("rejects bad or impossible dates", () => {
    expect(parseMfapiDate("2026-10-09")).toBeNull();
    expect(parseMfapiDate("31-02-2026")).toBeNull();
    expect(parseMfapiDate("garbage")).toBeNull();
  });
  it("goes one month back and clamps to month end", () => {
    expect(oneMonthBefore("2026-10-09")).toBe("2026-09-09");
    expect(oneMonthBefore("2026-03-31")).toBe("2026-02-28");
    expect(oneMonthBefore("2028-03-31")).toBe("2028-02-29"); // leap year
    expect(oneMonthBefore("2026-01-15")).toBe("2025-12-15"); // across a year
  });
  it("finds 31 Dec of the previous year", () => {
    expect(endOfPreviousYear("2026-10-09")).toBe("2025-12-31");
  });
});

describe("cleanSeries", () => {
  it("sorts, de-duplicates and drops bad rows", () => {
    const out = cleanSeries([
      { date: "2026-01-03", value: 12 },
      { date: "2026-01-01", value: 10 },
      { date: "2026-01-02", value: NaN },
      { date: "2026-01-04", value: 0 },
      { date: "2026-01-05", value: -3 },
      { date: "not-a-date", value: 5 },
      { date: "2026-01-01", value: 11 }, // duplicate: last one wins
    ]);
    expect(out).toEqual([
      { date: "2026-01-01", value: 11 },
      { date: "2026-01-03", value: 12 },
    ]);
  });
  it("converts mfapi rows (newest first, string NAVs)", () => {
    const out = seriesFromMfapi([
      { date: "09-10-2026", nav: "50.5" },
      { date: "08-10-2026", nav: "50.0" },
      { date: "07-10-2026", nav: "abc" },
    ]);
    expect(out.map((p) => p.date)).toEqual(["2026-10-08", "2026-10-09"]);
  });
});

describe("onOrBefore", () => {
  const s: Point[] = [
    { date: "2026-01-02", value: 1 },
    { date: "2026-01-05", value: 2 },
  ];
  it("returns an exact match", () => expect(onOrBefore(s, "2026-01-05")?.value).toBe(2));
  it("falls back to the nearest EARLIER date", () => expect(onOrBefore(s, "2026-01-04")?.value).toBe(1));
  it("returns null when everything is later", () => expect(onOrBefore(s, "2026-01-01")).toBeNull());
  it("returns null for an empty series", () => expect(onOrBefore([], "2026-01-01")).toBeNull());
});

describe("computeReturns", () => {
  // Friday 9 Oct 2026 is the latest value. Week target = Fri 2 Oct (exists).
  const series = weekdays("2025-12-01", "2026-10-09");
  const value = (d: string) => series.find((p) => p.date === d)!.value;

  it("computes week-on-week against 7 days earlier", () => {
    const r = computeReturns(series)!;
    expect(r.asOf).toBe("2026-10-09");
    expect(r.week!.baseDate).toBe("2026-10-02");
    expect(r.week!.pct).toBeCloseTo((value("2026-10-09") / value("2026-10-02") - 1) * 100, 10);
  });

  it("uses the previous trading day when the target falls on a weekend", () => {
    // Latest is Mon 12 Oct 2026. The month target, 12 Sep 2026, is a Saturday,
    // so the base should be Friday 11 Sep.
    const s = weekdays("2025-12-01", "2026-10-12");
    const r = computeReturns(s)!;
    expect(r.asOf).toBe("2026-10-12");
    expect(r.month!.baseDate).toBe("2026-09-11");
  });

  it("falls back over a holiday (missing weekday)", () => {
    const s = weekdays("2025-12-01", "2026-10-09").filter((p) => p.date !== "2026-10-02");
    const r = computeReturns(s)!;
    expect(r.week!.baseDate).toBe("2026-10-01"); // 2 Oct is a holiday -> Thursday 1 Oct
  });

  it("uses the last trading day of the previous year for year-to-date", () => {
    // 31 Dec 2025 is a Wednesday and exists.
    const r = computeReturns(series)!;
    expect(r.ytd!.baseDate).toBe("2025-12-31");
  });

  it("year-to-date skips back when 31 Dec is a weekend", () => {
    // 31 Dec 2022 was a Saturday -> last trading day was Fri 30 Dec.
    const s = weekdays("2022-12-01", "2023-03-10");
    const r = computeReturns(s)!;
    expect(r.ytd!.baseDate).toBe("2022-12-30");
  });

  it("returns null for windows with no data far enough back (missing NAV)", () => {
    // Only 5 days of history: no month or year-to-date base.
    const s = weekdays("2026-10-05", "2026-10-09");
    const r = computeReturns(s)!;
    expect(r.week).toBeNull();
    expect(r.month).toBeNull();
    expect(r.ytd).toBeNull();
  });

  it("does not use a stale base more than 7 days before the target", () => {
    // Data exists up to 1 Jun and then jumps to October: the 2 Oct target has no fresh base.
    const s: Point[] = [
      { date: "2026-06-01", value: 100 },
      { date: "2026-10-09", value: 110 },
    ];
    const r = computeReturns(s)!;
    expect(r.week).toBeNull();
    expect(r.month).toBeNull();
  });

  it("returns null for an empty or fully invalid series", () => {
    expect(computeReturns([])).toBeNull();
    expect(computeReturns([{ date: "2026-01-01", value: NaN }])).toBeNull();
  });

  it("can compute 'as of' an earlier date", () => {
    const r = computeReturns(series, "2026-09-30")!;
    expect(r.asOf).toBe("2026-09-30");
  });

  it("matches a hand-calculated example", () => {
    const s: Point[] = [
      { date: "2025-12-31", value: 100 },
      { date: "2026-09-09", value: 120 },
      { date: "2026-10-02", value: 125 },
      { date: "2026-10-09", value: 122.5 },
    ];
    const r = computeReturns(s)!;
    expect(r.week!.pct).toBeCloseTo(-2.0, 10); // 122.5/125 - 1
    expect(r.month!.pct).toBeCloseTo(((122.5 / 120) - 1) * 100, 10); // base 9 Sep
    expect(r.ytd!.pct).toBeCloseTo(22.5, 10);
  });

  it("handles a falling market (negative returns)", () => {
    const s: Point[] = [
      { date: "2026-10-02", value: 200 },
      { date: "2026-10-09", value: 190 },
    ];
    expect(computeReturns(s)!.week!.pct).toBeCloseTo(-5, 10);
  });
});

describe("averagePeerReturns", () => {
  const mk = (week: number | null, month: number | null, ytd: number | null) => ({
    asOf: "2026-10-09",
    latestValue: 1,
    week: week === null ? null : { pct: week, baseDate: "x", baseValue: 1 },
    month: month === null ? null : { pct: month, baseDate: "x", baseValue: 1 },
    ytd: ytd === null ? null : { pct: ytd, baseDate: "x", baseValue: 1 },
  });

  it("averages across peers", () => {
    const a = averagePeerReturns([mk(1, 2, 3), mk(3, 4, 5)]);
    expect(a.week).toBeCloseTo(2);
    expect(a.month).toBeCloseTo(3);
    expect(a.ytd).toBeCloseTo(4);
    expect(a.peersUsed).toBe(2);
    expect(a.peersRequested).toBe(2);
  });

  it("skips peers that failed to load and reports how many were used", () => {
    const a = averagePeerReturns([mk(1, 1, 1), null, mk(3, 3, 3), null]);
    expect(a.week).toBeCloseTo(2);
    expect(a.peersUsed).toBe(2);
    expect(a.peersRequested).toBe(4);
  });

  it("averages each window only over peers that have it", () => {
    const a = averagePeerReturns([mk(2, null, 10), mk(4, 6, null)]);
    expect(a.week).toBeCloseTo(3);
    expect(a.month).toBeCloseTo(6);
    expect(a.ytd).toBeCloseTo(10);
  });

  it("returns nulls when every peer failed", () => {
    const a = averagePeerReturns([null, null]);
    expect(a).toEqual({ week: null, month: null, ytd: null, peersRequested: 2, peersUsed: 0 });
  });

  it("returns nulls for an empty peer list (e.g. International has none yet)", () => {
    const a = averagePeerReturns([]);
    expect(a.week).toBeNull();
    expect(a.peersRequested).toBe(0);
  });
});
