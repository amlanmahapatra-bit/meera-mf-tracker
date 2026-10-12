/**
 * Loading with a safety net: try the live source, save what we got, and if the live source is down
 * fall back to the copy we saved earlier (and say so). Nothing here ever returns invented data.
 */
import { addDays, type Point } from "../returns";
import { istToday } from "../dates";
import { latestStoredDate, readStoredIndex, readStoredNav, upsertIndex, upsertNav } from "../db";
import { fetchIndexSeries } from "../sources/indices";
import { fetchScheme, type SchemeInfo } from "../sources/mfapi";

export type Loaded = {
  series: Point[];
  source: "live" | "cache";
  /** Plain-language note when something fell back; empty when all is well. */
  note: string;
  /** Newest date in the data ("data as of"). */
  asOf: string;
  scheme?: SchemeInfo;
};

/** Rows to write: everything if nothing is stored yet, otherwise only the last week of overlap onward. */
const tailSince = (series: Point[], latestStored: string | null) =>
  latestStored ? series.filter((p) => p.date >= addDays(latestStored, -7)) : series;

export async function loadFundNav(code: number): Promise<Loaded> {
  try {
    const scheme = await fetchScheme(code);
    const stored = await latestStoredDate("nav_history", "scheme_code", code).catch(() => null);
    await upsertNav(code, tailSince(scheme.series, stored));
    return { series: scheme.series, source: "live", note: "", asOf: scheme.series[scheme.series.length - 1].date, scheme };
  } catch (liveError) {
    const cached = await readStoredNav(code);
    if (cached.length === 0) throw new Error(`No live NAV and nothing saved for scheme ${code}: ${(liveError as Error).message}`);
    const asOf = cached[cached.length - 1].date;
    return { series: cached, source: "cache", asOf, note: `Live prices were unavailable, so saved prices up to ${asOf} were used.` };
  }
}

/**
 * Index closes. Today's row is dropped: a day that is still in progress is not a close,
 * and a half-finished value would make Meera's numbers wrong.
 */
export async function loadIndex(symbol: string, label: string, opts: { range?: string; storeAll?: boolean } = {}): Promise<Loaded> {
  const today = istToday();
  try {
    const live = (await fetchIndexSeries(symbol, opts.range ?? "2y")).filter((p) => p.date < today);
    const stored = opts.storeAll ? null : await latestStoredDate("index_history", "symbol", symbol).catch(() => null);
    await upsertIndex(symbol, tailSince(live, stored));
    return { series: live, source: "live", note: "", asOf: live[live.length - 1].date };
  } catch (liveError) {
    const cached = await readStoredIndex(symbol);
    if (cached.length === 0) throw new Error(`No live data and nothing saved for ${label}: ${(liveError as Error).message}`);
    const asOf = cached[cached.length - 1].date;
    return { series: cached, source: "cache", asOf, note: `Live ${label} data was unavailable, so saved data up to ${asOf} was used.` };
  }
}

/** Runs `fn` over items with at most `limit` in flight (be polite to free APIs). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Peer fund price histories; a peer that fails to load becomes null and is skipped (and counted) later. */
export async function loadPeerSeries(codes: number[]): Promise<(Point[] | null)[]> {
  return mapLimit(codes, 5, (code) =>
    fetchScheme(code).then((s) => s.series).catch(() => null as Point[] | null),
  );
}
