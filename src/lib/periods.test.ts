import { describe, expect, it } from "vitest";
import { periodReturns } from "./periods";
import { addDays, monthsBefore, type Point } from "./returns";

/** Weekday-only daily prices rising 0.1 per weekday. */
function history(from: string, to: string, start = 100): Point[] {
  const out: Point[] = [];
  let v = start;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push({ date: d, value: v });
    v += 0.1;
  }
  return out;
}
const row = (s: ReturnType<typeof periodReturns>, key: string) => s!.rows.find((r) => r.key === key)!;

describe("monthsBefore", () => {
  it("handles several months, years and clamping", () => {
    expect(monthsBefore("2026-10-09", 6)).toBe("2026-04-09");
    expect(monthsBefore("2026-10-09", 12)).toBe("2025-10-09");
    expect(monthsBefore("2026-01-15", 2)).toBe("2025-11-15");
    expect(monthsBefore("2026-08-31", 6)).toBe("2026-02-28");
    expect(monthsBefore("2028-02-29", 12)).toBe("2027-02-28");
    expect(monthsBefore("2026-10-09", 60)).toBe("2021-10-09");
  });
});

describe("periodReturns", () => {
  const s = periodReturns(history("2019-01-01", "2026-10-09"))!;

  it("reports every period for a long history", () => {
    expect(s.rows.map((r) => r.key)).toEqual(["1d", "1w", "1m", "6m", "1y", "3y", "5y", "all"]);
    expect(s.rows.every((r) => r.pct !== null)).toBe(true);
    expect(s.years).toBeGreaterThan(7.5);
  });

  it("1 day compares with the previous trading day (Friday vs Thursday)", () => {
    const r = row(s, "1d");
    expect(r.baseDate).toBe("2026-10-08");
  });

  it("longer periods use the nearest earlier day for the start", () => {
    expect(row(s, "1w").baseDate).toBe("2026-10-02");
    expect(row(s, "6m").baseDate).toBe("2026-04-09");
    expect(row(s, "5y").baseDate).toBe("2021-10-08"); // 9 Oct 2021 was a Saturday
  });

  it("gives the average change per year only for a year or more", () => {
    expect(row(s, "1m").perYear).toBeNull();
    expect(row(s, "6m").perYear).toBeNull();
    expect(row(s, "3y").perYear).not.toBeNull();
    expect(row(s, "5y").perYear).not.toBeNull();
  });

  it("per-year figure is the compound rate", () => {
    // 100 -> 121 over exactly two years is 10% a year.
    const two: Point[] = [{ date: "2024-10-09", value: 100 }, { date: "2025-10-09", value: 110 }, { date: "2026-10-09", value: 121 }];
    const r = row(periodReturns(two), "all");
    expect(r.pct).toBeCloseTo(21, 6);
    expect(r.perYear!).toBeGreaterThan(9.9);
    expect(r.perYear!).toBeLessThan(10.1);
    expect(row(periodReturns(two), "1y").perYear!).toBeCloseTo(row(periodReturns(two), "1y").pct!, 1);
  });

  it("a young fund has no 3 or 5 year figure (never invented)", () => {
    const young = periodReturns(history("2022-11-04", "2026-10-09"))!;
    expect(row(young, "1y").pct).not.toBeNull();
    expect(row(young, "3y").pct).not.toBeNull(); // ~3.9 years of history
    expect(row(young, "5y").pct).toBeNull();
    expect(row(young, "5y").baseDate).toBeNull();
    expect(row(young, "all").pct).not.toBeNull();
    expect(young.years).toBeGreaterThan(3.8);
    expect(young.years).toBeLessThan(4.1);
  });

  it("a brand-new fund only has the short periods", () => {
    const tiny = periodReturns(history("2026-09-01", "2026-10-09"))!;
    expect(row(tiny, "1d").pct).not.toBeNull();
    expect(row(tiny, "1w").pct).not.toBeNull();
    expect(row(tiny, "1m").pct).not.toBeNull();
    expect(row(tiny, "6m").pct).toBeNull();
    expect(row(tiny, "1y").pct).toBeNull();
  });

  it("falls back across a holiday gap but refuses a stale start", () => {
    const gappy: Point[] = [{ date: "2025-01-01", value: 100 }, { date: "2026-10-09", value: 130 }];
    expect(row(periodReturns(gappy), "1y").pct).toBeNull(); // nothing near 9 Oct 2025
    expect(row(periodReturns(gappy), "all").pct).toBeCloseTo(30, 6);
  });

  it("computes the percentages correctly", () => {
    const d: Point[] = [{ date: "2026-10-08", value: 50 }, { date: "2026-10-09", value: 51 }];
    expect(row(periodReturns(d), "1d").pct).toBeCloseTo(2, 10);
  });

  it("returns null when there is nothing to compare", () => {
    expect(periodReturns([])).toBeNull();
    expect(periodReturns([{ date: "2026-10-09", value: 1 }])).toBeNull();
  });
});
