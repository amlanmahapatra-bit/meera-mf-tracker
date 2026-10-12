/**
 * Benchmark + category comparison and the "market or fund?" split.
 * Pure functions: numbers in, numbers out. No network, no AI.
 */
import {
  addDays,
  averagePeerReturns,
  computeReturns,
  daysBetween,
  onOrBefore,
  WINDOWS,
  MAX_FALLBACK_DAYS,
  type PeerAverage,
  type Point,
  type Returns,
  type Window,
  type WindowReturn,
} from "./returns";

export type WindowValues = Record<Window, number | null>;

const pctOf = (r: Returns | null): WindowValues => ({
  week: r?.week?.pct ?? null,
  month: r?.month?.pct ?? null,
  ytd: r?.ytd?.pct ?? null,
});

/** a - b per window; null if either side is missing. */
function gap(a: WindowValues, b: WindowValues): WindowValues {
  const out = {} as WindowValues;
  for (const w of WINDOWS) out[w] = a[w] !== null && b[w] !== null ? a[w]! - b[w]! : null;
  return out;
}

/** An index quoted in dollars becomes rupees: close(USD) x USDINR on (or just before) the same day. */
export function convertToInr(index: Point[], usdInr: Point[], maxFxStaleDays = 7): Point[] {
  const out: Point[] = [];
  for (const p of index) {
    const fx = onOrBefore(usdInr, p.date);
    if (!fx || daysBetween(fx.date, p.date) > maxFxStaleDays) continue;
    out.push({ date: p.date, value: p.value * fx.value });
  }
  return out;
}

/**
 * Returns of `series` over the SAME periods the fund used: the same end date and the same
 * start dates (shifted back by `lagDays` for markets that close a day behind India).
 * Using the fund's own dates, not freshly guessed ones, keeps the comparison fair even when
 * only one side had a holiday. Null windows stay null; a series too stale for a date gives null.
 */
export function matchedReturns(series: Point[], fund: Returns, lagDays = 0, maxStaleDays = 5): Returns | null {
  const endTarget = addDays(fund.asOf, -lagDays);
  const end = onOrBefore(series, endTarget);
  if (!end || daysBetween(end.date, endTarget) > maxStaleDays) return null;
  const one = (w: WindowReturn | null): WindowReturn | null => {
    if (!w) return null;
    const target = addDays(w.baseDate, -lagDays);
    const base = onOrBefore(series, target);
    if (!base || daysBetween(base.date, target) > MAX_FALLBACK_DAYS || base.date >= end.date) return null;
    return { pct: (end.value / base.value - 1) * 100, baseDate: base.date, baseValue: base.value };
  };
  return { asOf: end.date, latestValue: end.value, week: one(fund.week), month: one(fund.month), ytd: one(fund.ytd) };
}

/** Peer average over the fund's own periods. A null series means that peer failed to load. */
export function peerAverageMatched(peerSeries: (Point[] | null)[], fund: Returns): PeerAverage {
  return averagePeerReturns(peerSeries.map((s) => (s ? matchedReturns(s, fund) : null)));
}

/**
 * Returns of a series as of a given date, with its own freshly worked-out periods.
 * Used for market-context index moves (not for fund comparisons).
 */
export function alignedReturns(series: Point[], asOf: string, lagDays = 0, maxStaleDays = 5): Returns | null {
  const target = addDays(asOf, -lagDays);
  const r = computeReturns(series, target);
  if (!r) return null;
  return daysBetween(r.asOf, target) > maxStaleDays ? null : r;
}

export type Split = {
  /** The fund's whole move this week, in percent. */
  total: number;
  /** Part explained by the market (the benchmark's own move). */
  marketPart: number;
  /** Part that is down to the fund itself (fund minus benchmark). marketPart + fundPart = total. */
  fundPart: number;
};

export type FundComparison = {
  asOf: string;
  fund: WindowValues;
  benchmarkName: string | null;
  /** A benchmark is configured but its data could not be loaded this time. */
  benchmarkMissing: boolean;
  benchmark: WindowValues | null;
  gapVsBenchmark: WindowValues | null;
  category: WindowValues;
  peersUsed: number;
  peersRequested: number;
  gapVsCategory: WindowValues;
  /** What the fund is judged against: its benchmark if we have one, otherwise the category average. */
  reference: "benchmark" | "category" | "none";
  gapVsReference: WindowValues;
  /** Market-vs-fund split of this week's move (needs a benchmark; null for the debt fund). */
  split: Split | null;
};

export function compareFund(args: {
  fundReturns: Returns;
  benchmarkName: string | null;
  benchmarkReturns: Returns | null;
  peers: PeerAverage;
}): FundComparison {
  const fund = pctOf(args.fundReturns);
  const benchmark = args.benchmarkReturns ? pctOf(args.benchmarkReturns) : null;
  const category: WindowValues = { week: args.peers.week, month: args.peers.month, ytd: args.peers.ytd };
  const gapVsBenchmark = benchmark ? gap(fund, benchmark) : null;
  const gapVsCategory = gap(fund, category);

  const reference = benchmark ? "benchmark" : category.month !== null || category.week !== null ? "category" : "none";
  const gapVsReference = benchmark ? gapVsBenchmark! : gapVsCategory;

  const split: Split | null =
    benchmark && fund.week !== null && benchmark.week !== null
      ? { total: fund.week, marketPart: benchmark.week, fundPart: fund.week - benchmark.week }
      : null;

  return {
    asOf: args.fundReturns.asOf,
    fund,
    benchmarkName: args.benchmarkName,
    benchmarkMissing: args.benchmarkName !== null && benchmark === null,
    benchmark,
    gapVsBenchmark,
    category,
    peersUsed: args.peers.peersUsed,
    peersRequested: args.peers.peersRequested,
    gapVsCategory,
    reference,
    gapVsReference,
    split,
  };
}
