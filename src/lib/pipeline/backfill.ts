/**
 * Fills in past weeks of the trend chart from the real price history, using the same maths as a live Saturday.
 * Safe to repeat (upserts), and it never overwrites a real written report: it only writes weeks BEFORE the first
 * live one, and those rows have no written summary.
 */
import { BENCHMARKS, USDINR_SYMBOL } from "../config";
import { convertToInr } from "../comparison";
import { istToday, weekEndingFor } from "../dates";
import { firstLiveSnapshotWeek, getActiveFunds, upsertSnapshots } from "../db";
import { addDays, type Point } from "../returns";
import { computeFundSnapshots, saturdaysBetween, type BackfillFund } from "../snapshots";
import { loadFundNav, loadIndex, loadPeerSeries } from "./load";
import type { JobOutcome } from "./run";

export async function runBackfill(opts: { years?: number } = {}): Promise<JobOutcome> {
  const years = Math.min(Math.max(Math.round(opts.years ?? 5), 1), 15);
  const funds = await getActiveFunds();
  if (funds.length === 0) throw new Error("There are no active funds.");

  const latestSaturday = weekEndingFor(istToday());
  const firstLive = await firstLiveSnapshotWeek();
  const lastWeek = firstLive ? addDays(firstLive, -7) : latestSaturday;
  const firstWeek = addDays(latestSaturday, -7 * 52 * years);
  const weeks = saturdaysBetween(firstWeek, lastWeek);
  if (weeks.length === 0) return { status: "success", details: { note: "Nothing to fill in.", years } };

  const notes: string[] = [];
  const indexCache = new Map<string, Promise<Point[] | null>>();
  const getIndex = (symbol: string, label: string) => {
    if (!indexCache.has(symbol)) {
      indexCache.set(symbol, loadIndex(symbol, label, { range: `${Math.min(years + 1, 15)}y`, storeAll: true }).then((r) => r.series).catch((e) => { notes.push(`${label}: ${(e as Error).message}`); return null; }));
    }
    return indexCache.get(symbol)!;
  };

  const perFund: Record<string, number> = {};
  const allRows = [];
  for (const f of funds) {
    let nav;
    try {
      nav = await loadFundNav(f.scheme_code);
    } catch (e) {
      notes.push(`${f.name}: ${(e as Error).message}`);
      continue;
    }
    let benchmark: BackfillFund["benchmark"] = null;
    const cfg = f.benchmark_name ? BENCHMARKS[f.benchmark_name] : undefined;
    if (cfg) {
      let series = await getIndex(cfg.symbol, f.benchmark_name!);
      if (series && cfg.currency === "USD") {
        const fx = await getIndex(USDINR_SYMBOL, "US dollar to rupee rate");
        series = fx ? convertToInr(series, fx, cfg.lagDays) : null;
      }
      if (series) benchmark = { series, lagDays: cfg.lagDays };
      else notes.push(`${f.name}: index data was not available, so it is compared with similar funds only.`);
    }
    const peers = await loadPeerSeries(f.peer_codes);
    const rows = computeFundSnapshots({ schemeCode: f.scheme_code, benchmarkName: f.benchmark_name, nav: nav.series, benchmark, peers, trackingAllowance: cfg?.trackingAllowance ?? 0 }, weeks);
    perFund[f.name] = rows.length;
    allRows.push(...rows.map((r) => ({ ...r, summary: null })));
  }
  if (allRows.length === 0) throw new Error(`No weekly history could be built. ${notes.join(" | ")}`);

  await upsertSnapshots(allRows);
  return {
    status: notes.length ? "partial" : "success",
    details: { years, from: weeks[0], to: weeks[weeks.length - 1], weeksTried: weeks.length, rowsWritten: allRows.length, perFund, notes },
  };
}
