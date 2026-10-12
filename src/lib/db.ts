/**
 * All database reads and writes in one place. Server-only (uses the service role key).
 * Every write is an upsert on the table's unique key, so running a job twice never duplicates rows.
 */
import { getSupabase } from "./supabase";
import type { Point } from "./returns";

const CHUNK = 1000;
export type Json = Record<string, unknown>;

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Database error while ${what}: ${res.error.message}`);
  return res.data as T;
}

// ---------- funds ----------
export type FundRow = {
  scheme_code: number;
  name: string;
  fund_house: string | null;
  slot: string;
  benchmark_name: string | null;
  benchmark_symbol: string | null;
  peer_codes: number[];
  active: boolean;
  added_at: string;
};

export async function getActiveFunds(): Promise<FundRow[]> {
  const rows = check(await getSupabase().from("funds").select("*").eq("active", true).order("added_at"), "loading funds") as FundRow[];
  return rows;
}

// ---------- NAV and index history ----------
async function upsertChunks(table: string, conflict: string, rows: Json[]): Promise<number> {
  const sb = getSupabase();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: conflict });
    if (error) throw new Error(`Database error while saving ${table}: ${error.message}`);
  }
  return rows.length;
}

export const upsertNav = (code: number, series: Point[]) =>
  upsertChunks("nav_history", "scheme_code,nav_date", series.map((p) => ({ scheme_code: code, nav_date: p.date, nav: p.value })));

export const upsertIndex = (symbol: string, series: Point[]) =>
  upsertChunks("index_history", "symbol,price_date", series.map((p) => ({ symbol, price_date: p.date, close: p.value })));

/** Reads a whole history back in pages (Supabase returns at most 1000 rows per request). */
async function readAll(table: string, key: string, keyValue: string | number, dateCol: string, valueCol: string): Promise<Point[]> {
  const sb = getSupabase();
  const out: Point[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await sb.from(table).select(`${dateCol}, ${valueCol}`).eq(key, keyValue).order(dateCol).range(from, from + CHUNK - 1);
    if (error) throw new Error(`Database error while reading ${table}: ${error.message}`);
    for (const r of (data ?? []) as unknown as Record<string, string | number>[]) out.push({ date: String(r[dateCol]), value: Number(r[valueCol]) });
    if (!data || data.length < CHUNK) break;
  }
  return out;
}

export const readStoredNav = (code: number) => readAll("nav_history", "scheme_code", code, "nav_date", "nav");
export const readStoredIndex = (symbol: string) => readAll("index_history", "symbol", symbol, "price_date", "close");

export async function latestStoredDate(table: "nav_history" | "index_history", key: string, value: string | number): Promise<string | null> {
  const dateCol = table === "nav_history" ? "nav_date" : "price_date";
  const { data, error } = await getSupabase().from(table).select(dateCol).eq(key, value).order(dateCol, { ascending: false }).limit(1);
  if (error) throw new Error(`Database error while reading ${table}: ${error.message}`);
  const row = (data ?? [])[0] as unknown as Record<string, string> | undefined;
  return row ? row[dateCol] : null;
}

// ---------- weekly snapshots and reports ----------
export type SnapshotRow = {
  week_ending: string;
  scheme_code: number;
  nav: number | null;
  ret_1w: number | null; ret_1m: number | null; ret_ytd: number | null;
  bench_ret_1w: number | null; bench_ret_1m: number | null; bench_ret_ytd: number | null;
  cat_avg_1w: number | null; cat_avg_1m: number | null; cat_avg_ytd: number | null;
  market_part_1w: number | null; fund_part_1w: number | null;
  status: string; weeks_lagging: number; summary: string | null;
};

export const upsertSnapshots = (rows: SnapshotRow[]) => upsertChunks("weekly_snapshots", "week_ending,scheme_code", rows as unknown as Json[]);

/** The most recent snapshot for a fund from BEFORE the given week (so re-running a week never double counts). */
export async function previousSnapshot(code: number, weekEnding: string): Promise<{ week_ending: string; weeks_lagging: number } | null> {
  const { data, error } = await getSupabase()
    .from("weekly_snapshots").select("week_ending, weeks_lagging").eq("scheme_code", code).lt("week_ending", weekEnding)
    .order("week_ending", { ascending: false }).limit(1);
  if (error) throw new Error(`Database error while reading snapshots: ${error.message}`);
  return ((data ?? [])[0] as { week_ending: string; weeks_lagging: number } | undefined) ?? null;
}

export type ReportRow = { week_ending: string; verdict: string; verdict_reason: string; market_context: Json | null; report_json: Json | null };

export async function upsertReport(row: ReportRow): Promise<void> {
  const { error } = await getSupabase().from("weekly_reports").upsert(row, { onConflict: "week_ending" });
  if (error) throw new Error(`Database error while saving the report: ${error.message}`);
}

export async function latestReport(): Promise<(ReportRow & { created_at: string }) | null> {
  const { data, error } = await getSupabase().from("weekly_reports").select("*").order("week_ending", { ascending: false }).limit(1);
  if (error) throw new Error(`Database error while reading the report: ${error.message}`);
  return ((data ?? [])[0] as (ReportRow & { created_at: string }) | undefined) ?? null;
}

// ---------- pipeline_runs (reliability log) ----------
export type RunJob = "daily_nav" | "weekly_report" | "manual_run" | "backfill";
export type RunStatus = "running" | "success" | "partial" | "failed";

export async function startRun(job: RunJob): Promise<string> {
  const row = check(await getSupabase().from("pipeline_runs").insert({ job }).select("id").single(), "starting a run log") as { id: string };
  return row.id;
}

export async function finishRun(id: string, status: Exclude<RunStatus, "running">, error: string | null, details: Json): Promise<void> {
  const { error: e } = await getSupabase().from("pipeline_runs").update({ finished_at: new Date().toISOString(), status, error, details }).eq("id", id);
  if (e) console.error("Could not update pipeline_runs:", e.message);
}

/** True if this job started in the last `minutes` and has not finished (stops accidental double runs). */
export async function isRunInProgress(job: RunJob, minutes = 10): Promise<boolean> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await getSupabase().from("pipeline_runs").select("id").eq("job", job).eq("status", "running").gte("started_at", since).limit(1);
  if (error) return false; // never block a run just because the log could not be read
  return (data ?? []).length > 0;
}

export async function recentRuns(limit = 10) {
  const { data, error } = await getSupabase().from("pipeline_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Database error while reading runs: ${error.message}`);
  return data ?? [];
}

/** Last few weeks' statuses for one fund (before the given week), newest first. Gives Gemini some history. */
export async function recentStatuses(code: number, beforeWeek: string, n = 4): Promise<{ weekEnding: string; status: string }[]> {
  const { data, error } = await getSupabase()
    .from("weekly_snapshots").select("week_ending, status").eq("scheme_code", code).lt("week_ending", beforeWeek)
    .order("week_ending", { ascending: false }).limit(n);
  if (error) return [];
  return ((data ?? []) as { week_ending: string; status: string }[]).map((r) => ({ weekEnding: r.week_ending, status: r.status }));
}

// ---------- fund management ----------
export async function getFund(code: number): Promise<FundRow | null> {
  const { data, error } = await getSupabase().from("funds").select("*").eq("scheme_code", code).maybeSingle();
  if (error) throw new Error(`Database error while reading the fund: ${error.message}`);
  return (data as FundRow | null) ?? null;
}

export async function saveFund(row: Omit<FundRow, "added_at">): Promise<void> {
  const { error } = await getSupabase().from("funds").upsert(row, { onConflict: "scheme_code" });
  if (error) throw new Error(`Database error while saving the fund: ${error.message}`);
}

export async function setFundActive(code: number, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("funds").update({ active }).eq("scheme_code", code);
  if (error) throw new Error(`Database error while updating the fund: ${error.message}`);
}

/** Only used to undo a half-finished "add fund" (the fund row was created moments ago and has no history worth keeping). */
export async function deleteFund(code: number): Promise<void> {
  const { error } = await getSupabase().from("funds").delete().eq("scheme_code", code);
  if (error) console.error("Could not undo the fund row:", error.message);
}
