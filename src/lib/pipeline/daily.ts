import { BENCHMARKS, MARKET_CONTEXT_INDEXES, USDINR_SYMBOL } from "../config";
import { getActiveFunds } from "../db";
import { loadFundNav, loadIndex, mapLimit } from "./load";
import type { JobOutcome } from "./run";

/** Every index symbol the app uses (benchmarks, market context, and the dollar-rupee rate). */
export function allIndexSymbols(): { symbol: string; label: string }[] {
  const map = new Map<string, string>();
  for (const [name, b] of Object.entries(BENCHMARKS)) map.set(b.symbol, name);
  for (const m of MARKET_CONTEXT_INDEXES) map.set(m.symbol, m.name);
  map.set(USDINR_SYMBOL, "US dollar to rupee rate");
  return [...map.entries()].map(([symbol, label]) => ({ symbol, label }));
}

/**
 * Daily job: save the latest prices for every active fund and the index closes.
 * Safe to run any number of times (upserts). Also heals up to a week of missed days.
 */
export async function runDailyNav(): Promise<JobOutcome> {
  const funds = await getActiveFunds();
  const notes: string[] = [];
  const failures: string[] = [];
  const latest: Record<string, string> = {};

  await mapLimit(funds, 3, async (f) => {
    try {
      const r = await loadFundNav(f.scheme_code);
      latest[String(f.scheme_code)] = r.asOf;
      if (r.note) notes.push(`${f.name}: ${r.note}`);
    } catch (e) {
      failures.push(`${f.name}: ${(e as Error).message}`);
    }
  });

  const indexLatest: Record<string, string> = {};
  await mapLimit(allIndexSymbols(), 3, async ({ symbol, label }) => {
    try {
      const r = await loadIndex(symbol, label);
      indexLatest[symbol] = r.asOf;
      if (r.note) notes.push(r.note);
    } catch (e) {
      failures.push(`${label}: ${(e as Error).message}`);
    }
  });

  if (Object.keys(latest).length === 0) throw new Error(`No fund could be updated. ${failures.join(" | ")}`);
  return {
    status: failures.length || notes.length ? "partial" : "success",
    details: { fundsUpdated: Object.keys(latest).length, fundsTotal: funds.length, latestNavDates: latest, latestIndexDates: indexLatest, notes, failures },
  };
}
