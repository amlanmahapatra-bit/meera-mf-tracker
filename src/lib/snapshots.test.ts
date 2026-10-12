import { describe, expect, it } from "vitest";
import { computeFundSnapshots, saturdaysBetween, snapshotDraft, type BackfillFund } from "./snapshots";
import { addDays, type Point } from "./returns";

/** Weekday prices; each weekday multiplies by (1 + dailyGrowth). */
function prices(from: string, to: string, start: number, dailyGrowth: number): Point[] {
  const out: Point[] = [];
  let v = start;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push({ date: d, value: v });
    v *= 1 + dailyGrowth;
  }
  return out;
}
const SAT = "2025-01-04"; // a Saturday
const weeks = saturdaysBetween(SAT, "2025-12-27");

describe("saturdaysBetween", () => {
  it("lists Saturdays oldest first, inclusive of both ends", () => {
    expect(saturdaysBetween("2026-09-19", "2026-10-10")).toEqual(["2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10"]);
    expect(saturdaysBetween("2026-10-10", "2026-10-10")).toEqual(["2026-10-10"]);
    expect(saturdaysBetween("2026-10-17", "2026-10-10")).toEqual([]);
  });
});

describe("computeFundSnapshots", () => {
  const market = prices("2024-01-01", "2025-12-31", 100, 0.0006);

  it("a fund that tracks its market is on track every week", () => {
    const fund: BackfillFund = { schemeCode: 1, benchmarkName: "Idx", nav: prices("2024-01-01", "2025-12-31", 50, 0.0006), benchmark: { series: market, lagDays: 0 }, peers: [] };
    const rows = computeFundSnapshots(fund, weeks);
    expect(rows.length).toBe(weeks.length);
    expect(rows.every((r) => r.status === "green" && r.weeks_lagging === 0)).toBe(true);
    expect(rows[0].week_ending).toBe(SAT);
    expect(rows[10].bench_ret_1m).not.toBeNull();
  });

  it("a fund that keeps lagging builds a weeks-behind streak, one per week, and turns red", () => {
    const flat = prices("2024-01-01", "2025-12-31", 50, 0); // never moves while the market rises
    const rows = computeFundSnapshots({ schemeCode: 2, benchmarkName: "Idx", nav: flat, benchmark: { series: market, lagDays: 0 }, peers: [] }, weeks);
    expect(rows.slice(0, 5).map((r) => r.weeks_lagging)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[rows.length - 1].weeks_lagging).toBe(rows.length);
    expect(rows[rows.length - 1].status).toBe("red");
  });

  it("the streak resets after a week when the fund catches up", () => {
    // Fund lags for 3 weeks (flat), then jumps ahead strongly for the rest.
    const nav: Point[] = prices("2024-01-01", "2025-01-24", 50, 0).concat(prices("2025-01-27", "2025-12-31", 50, 0.003));
    const rows = computeFundSnapshots({ schemeCode: 3, benchmarkName: "Idx", nav, benchmark: { series: market, lagDays: 0 }, peers: [] }, weeks);
    const streaks = rows.map((r) => r.weeks_lagging);
    expect(Math.max(...streaks.slice(0, 3))).toBeGreaterThanOrEqual(2);
    expect(streaks[streaks.length - 1]).toBe(0);
  });

  it("carries a starting streak from an earlier week", () => {
    const flat = prices("2024-01-01", "2025-12-31", 50, 0);
    const rows = computeFundSnapshots({ schemeCode: 2, benchmarkName: "Idx", nav: flat, benchmark: { series: market, lagDays: 0 }, peers: [] }, weeks, 7);
    expect(rows[0].weeks_lagging).toBe(8);
  });

  it("skips weeks before the fund existed (no invented history)", () => {
    const young = prices("2025-06-02", "2025-12-31", 10, 0.0005);
    const rows = computeFundSnapshots({ schemeCode: 4, benchmarkName: null, nav: young, benchmark: null, peers: [] }, weeks);
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.length).toBeLessThan(weeks.length);
    expect(rows[0].week_ending >= "2025-06-07").toBe(true);
  });

  it("skips weeks with no recent price (a data gap)", () => {
    const gappy = prices("2024-01-01", "2025-03-31", 50, 0.0005).concat(prices("2025-09-01", "2025-12-31", 55, 0.0005));
    const rows = computeFundSnapshots({ schemeCode: 5, benchmarkName: null, nav: gappy, benchmark: null, peers: [] }, weeks);
    const dates = rows.map((r) => r.week_ending);
    expect(dates.some((d) => d >= "2025-04-12" && d <= "2025-08-23")).toBe(false);
    expect(dates).toContain("2025-12-27");
  });

  it("debt-style fund (no index) is judged against similar funds and skips failed peers", () => {
    const fund = prices("2024-01-01", "2025-12-31", 30, 0.0002);
    const peerGood = prices("2024-01-01", "2025-12-31", 20, 0.0002);
    const rows = computeFundSnapshots({ schemeCode: 6, benchmarkName: null, nav: fund, benchmark: null, peers: [peerGood, null] }, weeks);
    expect(rows[5].bench_ret_1m).toBeNull();
    expect(rows[5].cat_avg_1m).not.toBeNull();
    expect(rows.every((r) => r.status === "green")).toBe(true);
  });

  it("a noisy-tracking fund gets the allowance: the same wobble is flagged without it and not with it", () => {
    // Fund wobbles 1.2% below the market for stretches (timing noise), but over time keeps up.
    const wobble: Point[] = prices("2024-01-01", "2025-12-31", 50, 0.0006).map((p, i) => ({ date: p.date, value: p.value * (1 + (Math.floor(i / 6) % 2 === 0 ? 0 : -0.014)) }));
    const strict = computeFundSnapshots({ schemeCode: 8, benchmarkName: "Idx", nav: wobble, benchmark: { series: market, lagDays: 0 }, peers: [] }, weeks);
    const lenient = computeFundSnapshots({ schemeCode: 8, benchmarkName: "Idx", nav: wobble, benchmark: { series: market, lagDays: 0 }, peers: [], trackingAllowance: 1.5 }, weeks);
    const flagged = (rows: typeof strict) => rows.filter((r) => r.status !== "green").length;
    expect(flagged(strict)).toBeGreaterThan(flagged(lenient));
    expect(flagged(lenient)).toBe(0);
  });

  it("is deterministic (running it twice gives identical rows, so the backfill is safe to repeat)", () => {
    const fund: BackfillFund = { schemeCode: 1, benchmarkName: "Idx", nav: prices("2024-01-01", "2025-12-31", 50, 0.0005), benchmark: { series: market, lagDays: 0 }, peers: [] };
    expect(computeFundSnapshots(fund, weeks)).toEqual(computeFundSnapshots(fund, weeks));
  });
});

describe("snapshotDraft", () => {
  it("stores an unknown status as empty, because the database only allows green, amber or red", () => {
    const c = { fund: { week: 1, month: null, ytd: null }, benchmark: null, category: { week: null, month: null, ytd: null }, split: null } as never;
    expect(snapshotDraft("2026-10-10", 7, 12.3, c, "unknown", 0).status).toBeNull();
    expect(snapshotDraft("2026-10-10", 7, 12.3, c, "amber", 4).status).toBe("amber");
  });
  it("maps a comparison onto the database columns", () => {
    const c = {
      fund: { week: 1, month: 2, ytd: 3 }, benchmark: { week: 0.5, month: 1.5, ytd: 2.5 }, category: { week: 0.4, month: 1.4, ytd: 2.4 },
      split: { total: 1, marketPart: 0.5, fundPart: 0.5 },
    } as never;
    expect(snapshotDraft("2026-10-10", 7, 12.3, c, "green", 0)).toEqual({
      week_ending: "2026-10-10", scheme_code: 7, nav: 12.3, ret_1w: 1, ret_1m: 2, ret_ytd: 3,
      bench_ret_1w: 0.5, bench_ret_1m: 1.5, bench_ret_ytd: 2.5, cat_avg_1w: 0.4, cat_avg_1m: 1.4, cat_avg_ytd: 2.4,
      market_part_1w: 0.5, fund_part_1w: 0.5, status: "green", weeks_lagging: 0,
    });
  });
});
