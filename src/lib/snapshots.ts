/**
 * Weekly snapshot rows. One shared way to turn a comparison into a database row, used by BOTH the live Saturday
 * job and the history backfill, plus the pure maths that replays past weeks from price history.
 */
import { compareFund, matchedReturns, peerAverageMatched, type FundComparison } from "./comparison";
import type { SnapshotRow } from "./db";
import { addDays, computeReturns, daysBetween, type Point } from "./returns";
import { fundStatus, nextWeeksLagging, type Status } from "./status";

export type SnapshotDraft = Omit<SnapshotRow, "summary">;

export function snapshotDraft(weekEnding: string, schemeCode: number, nav: number, c: FundComparison, status: Status, weeksLagging: number): SnapshotDraft {
  return {
    week_ending: weekEnding, scheme_code: schemeCode, nav,
    ret_1w: c.fund.week, ret_1m: c.fund.month, ret_ytd: c.fund.ytd,
    bench_ret_1w: c.benchmark?.week ?? null, bench_ret_1m: c.benchmark?.month ?? null, bench_ret_ytd: c.benchmark?.ytd ?? null,
    cat_avg_1w: c.category.week, cat_avg_1m: c.category.month, cat_avg_ytd: c.category.ytd,
    market_part_1w: c.split?.marketPart ?? null, fund_part_1w: c.split?.fundPart ?? null,
    // The database only allows green / amber / red; "unknown" (too little data) is stored as empty.
    status: status === "unknown" ? null : status, weeks_lagging: weeksLagging,
  };
}

/** Saturdays from `fromWeek` up to and including `toWeek` (both must be Saturdays), oldest first. */
export function saturdaysBetween(fromWeek: string, toWeek: string): string[] {
  const out: string[] = [];
  for (let d = fromWeek; d <= toWeek; d = addDays(d, 7)) out.push(d);
  return out;
}

export type BackfillFund = {
  schemeCode: number;
  benchmarkName: string | null;
  nav: Point[];
  /** The benchmark series ready to compare (already in rupees for the Nasdaq) and its date lag, or null if none/unavailable. */
  benchmark: { series: Point[]; lagDays: number } | null;
  /** See BENCHMARKS.trackingAllowance: widens the status thresholds for funds that follow their index loosely. */
  trackingAllowance?: number;
  /** Similar funds' price histories; null = failed to load. */
  peers: (Point[] | null)[];
};

/**
 * Replays the weekly check-up for past weeks using exactly the same maths as a live week:
 * the fund's returns, the index and similar funds on the fund's own dates, the status and the weeks-behind streak.
 * Weeks where the fund has no recent price (not started yet, or a data gap) are skipped.
 */
export function computeFundSnapshots(fund: BackfillFund, weeks: string[], startingStreak = 0): SnapshotDraft[] {
  const rows: SnapshotDraft[] = [];
  let streak = startingStreak;
  for (const week of weeks) {
    const fundReturns = computeReturns(fund.nav, week);
    if (!fundReturns || !fundReturns.week) continue; // not enough history yet for even a one-week figure
    if (daysBetween(fundReturns.asOf, week) > 7) continue; // no recent price around that week
    const benchReturns = fund.benchmark ? matchedReturns(fund.benchmark.series, fundReturns, fund.benchmark.lagDays) : null;
    const peers = peerAverageMatched(fund.peers, fundReturns);
    const comparison = compareFund({ fundReturns, benchmarkName: fund.benchmarkName, benchmarkReturns: benchReturns, peers });
    const allowance = fund.trackingAllowance ?? 0;
    streak = nextWeeksLagging(streak, comparison.gapVsReference.week, allowance);
    const status = fundStatus(comparison.gapVsReference.month, streak, allowance);
    rows.push(snapshotDraft(week, fund.schemeCode, fundReturns.latestValue, comparison, status, streak));
  }
  return rows;
}
