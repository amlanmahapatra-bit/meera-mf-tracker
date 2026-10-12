/** Reads for the screens. Server-only. Every function returns data or throws; pages turn a throw into a friendly message. */
import { getSupabase } from "./supabase";
import { latestReport, readStoredNav } from "./db";
import type { ReportJson } from "./report-types";
import type { Point } from "./returns";

export type LoadedReport = { report: ReportJson; savedAt: string };

/** The newest weekly report, or null if none has been generated yet. */
export async function getLatestReport(): Promise<LoadedReport | null> {
  const row = await latestReport();
  const json = row?.report_json as unknown as ReportJson | null;
  if (!row || !json || !Array.isArray(json.funds)) return null;
  return { report: json, savedAt: row.created_at };
}

/**
 * A fund's prices, oldest first. Up to 1,000 rows come back in one quick request (the newest ones);
 * for more, the whole history is read page by page (the database returns at most 1,000 rows at a time).
 */
export async function getNavSeries(code: number, rows = 20000): Promise<Point[]> {
  if (rows > 1000) return readStoredNav(code);
  const { data, error } = await getSupabase().from("nav_history").select("nav_date, nav").eq("scheme_code", code).order("nav_date", { ascending: false }).limit(rows);
  if (error) throw new Error(`Database error while reading prices: ${error.message}`);
  return ((data ?? []) as { nav_date: string; nav: number }[]).map((r) => ({ date: r.nav_date, value: Number(r.nav) })).reverse();
}

export type SnapshotPoint = { weekEnding: string; schemeCode: number; week: number | null; month: number | null; ytd: number | null; status: string | null; weeksLagging: number };

/** Every saved weekly snapshot (for the trend chart), oldest first. Read page by page: the database returns at most 1,000 rows at a time. */
export async function getSnapshots(): Promise<SnapshotPoint[]> {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const out: SnapshotPoint[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from("weekly_snapshots").select("week_ending, scheme_code, ret_1w, ret_1m, ret_ytd, status, weeks_lagging")
      .order("week_ending", { ascending: true }).order("scheme_code", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`Database error while reading snapshots: ${error.message}`);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.push({
        weekEnding: String(r.week_ending), schemeCode: Number(r.scheme_code), week: n(r.ret_1w), month: n(r.ret_1m), ytd: n(r.ret_ytd),
        status: (r.status as string) ?? null, weeksLagging: Number(r.weeks_lagging ?? 0),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}
