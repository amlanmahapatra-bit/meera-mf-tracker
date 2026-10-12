/**
 * Returns engine: week-on-week, month-on-month and year-to-date returns.
 *
 * Pure functions only (no network, no database), so every number is
 * deterministic and unit-tested. The same code works for fund NAVs and index closes.
 *
 * Rules:
 *  - Dates are ISO strings "YYYY-MM-DD" and all date maths is done in UTC.
 *  - If a target date has no value (weekend / holiday), use the nearest EARLIER date.
 *  - If the nearest earlier value is more than MAX_FALLBACK_DAYS before the target,
 *    the data is treated as missing and that return is null (never a made-up number).
 */

export type Point = { date: string; value: number };

export type Window = "week" | "month" | "ytd";
export const WINDOWS: Window[] = ["week", "month", "ytd"];

export type WindowReturn = {
  /** Return in percent, e.g. -2.13 means down 2.13%. */
  pct: number;
  /** The date whose value was used as the starting point (after weekend/holiday fallback). */
  baseDate: string;
  baseValue: number;
};

export type Returns = {
  /** Date of the newest value, i.e. "data as of". */
  asOf: string;
  latestValue: number;
  week: WindowReturn | null;
  month: WindowReturn | null;
  ytd: WindowReturn | null;
};

/** How far back we will look for a stand-in when the exact target date has no value. */
export const MAX_FALLBACK_DAYS = 7;

// ---------- date helpers (UTC, ISO strings) ----------

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcMs(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Bad ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * 86_400_000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / 86_400_000);
}

/** Same day-of-month `n` months earlier; clamps to month end (31 Mar - 1 month -> 28 Feb, 29 Feb - 12 months -> 28 Feb). */
export function monthsBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const targetIndex = m - 1 - n; // 0-based month index (may be negative; Date.UTC rolls the year)
  const lastDayOfTarget = new Date(Date.UTC(y, targetIndex + 1, 0)).getUTCDate();
  return fromUtcMs(Date.UTC(y, targetIndex, Math.min(d, lastDayOfTarget)));
}

/** Same day-of-month one month earlier; clamps to month end (31 Mar -> 28 Feb). */
export const oneMonthBefore = (iso: string): string => monthsBefore(iso, 1);

/** 31 December of the previous year; the nearest-earlier rule turns it into the last trading day. */
export function endOfPreviousYear(iso: string): string {
  return `${Number(iso.slice(0, 4)) - 1}-12-31`;
}

/** mfapi dates look like "09-10-2026" (DD-MM-YYYY). Returns null if invalid. */
export function parseMfapiDate(s: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  // Reject impossible dates such as 31-02-2026.
  return fromUtcMs(toUtcMs(iso)) === iso ? iso : null;
}

// ---------- series cleaning ----------

/**
 * Sorts oldest -> newest, drops rows with bad dates or non-positive / non-finite values,
 * and keeps only one value per date (the last one given wins).
 */
export function cleanSeries(raw: Point[]): Point[] {
  const byDate = new Map<string, number>();
  for (const p of raw) {
    if (!ISO_RE.test(p.date)) continue;
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    byDate.set(p.date, p.value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Converts mfapi rows ({date: "DD-MM-YYYY", nav: "12.34"}) into a clean series. */
export function seriesFromMfapi(rows: { date: string; nav: string }[]): Point[] {
  const pts: Point[] = [];
  for (const r of rows) {
    const date = parseMfapiDate(r.date);
    if (date) pts.push({ date, value: Number(r.nav) });
  }
  return cleanSeries(pts);
}

// ---------- core lookups ----------

/** Latest point on or before `target`. Series must be cleaned (sorted ascending). Binary search. */
export function onOrBefore(series: Point[], target: string): Point | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: Point | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= target) {
      found = series[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Return from the value on/before `targetDate` up to `latest`. Null when data is missing. */
export function returnSince(series: Point[], latest: Point, targetDate: string): WindowReturn | null {
  const base = onOrBefore(series, targetDate);
  if (!base) return null; // series starts after the target date
  if (daysBetween(base.date, targetDate) > MAX_FALLBACK_DAYS) return null; // too stale to trust
  if (base.date >= latest.date) return null; // nothing to compare against
  return {
    pct: (latest.value / base.value - 1) * 100,
    baseDate: base.date,
    baseValue: base.value,
  };
}

/**
 * Week / month / year-to-date returns for one series.
 * `asOf` (optional, ISO) lets you compute "as it was on that day"; default is the newest point.
 */
export function computeReturns(raw: Point[], asOf?: string): Returns | null {
  const series = cleanSeries(raw);
  const latest = asOf ? onOrBefore(series, asOf) : series[series.length - 1] ?? null;
  if (!latest) return null;
  return {
    asOf: latest.date,
    latestValue: latest.value,
    week: returnSince(series, latest, addDays(latest.date, -7)),
    month: returnSince(series, latest, oneMonthBefore(latest.date)),
    ytd: returnSince(series, latest, endOfPreviousYear(latest.date)),
  };
}

// ---------- category average from peer funds ----------

export type PeerAverage = {
  /** Average return per window, or null if no peer had that window. */
  week: number | null;
  month: number | null;
  ytd: number | null;
  /** How many peers were asked for, and how many actually loaded (for the "average of N funds" note). */
  peersRequested: number;
  peersUsed: number;
};

/**
 * Average of the peers' returns. `peerReturns` has one entry per peer;
 * pass null for a peer whose data failed to load, and it is skipped (and counted).
 * Each window is averaged only over the peers that have that window.
 */
export function averagePeerReturns(peerReturns: (Returns | null)[]): PeerAverage {
  const loaded = peerReturns.filter((r): r is Returns => r !== null);
  const avg = (w: Window): number | null => {
    const vals = loaded.map((r) => r[w]?.pct).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    week: avg("week"),
    month: avg("month"),
    ytd: avg("ytd"),
    peersRequested: peerReturns.length,
    peersUsed: loaded.length,
  };
}
