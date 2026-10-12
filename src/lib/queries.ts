/** Reads for the screens. Server-only. Every function returns data or throws; pages turn a throw into a friendly message. */
import { getSupabase } from "./supabase";
import { latestReport } from "./db";
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

/** Last ~14 months of prices for a fund, oldest first. */
export async function getNavSeries(code: number, rows = 400): Promise<Point[]> {
  const { data, error } = await getSupabase().from("nav_history").select("nav_date, nav").eq("scheme_code", code).order("nav_date", { ascending: false }).limit(rows);
  if (error) throw new Error(`Database error while reading prices: ${error.message}`);
  return ((data ?? []) as { nav_date: string; nav: number }[]).map((r) => ({ date: r.nav_date, value: Number(r.nav) })).reverse();
}

export type SnapshotPoint = { weekEnding: string; schemeCode: number; week: number | null; month: number | null; ytd: number | null; status: string | null; weeksLagging: number };

/** Every saved weekly snapshot (for the trend chart), oldest first. */
export async function getSnapshots(): Promise<SnapshotPoint[]> {
  const { data, error } = await getSupabase()
    .from("weekly_snapshots").select("week_ending, scheme_code, ret_1w, ret_1m, ret_ytd, status, weeks_lagging").order("week_ending", { ascending: true });
  if (error) throw new Error(`Database error while reading snapshots: ${error.message}`);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    weekEnding: String(r.week_ending), schemeCode: Number(r.scheme_code), week: n(r.ret_1w), month: n(r.ret_1m), ytd: n(r.ret_ytd),
    status: (r.status as string) ?? null, weeksLagging: Number(r.weeks_lagging ?? 0),
  }));
}
