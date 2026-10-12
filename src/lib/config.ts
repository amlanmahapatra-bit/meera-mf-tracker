/**
 * ALL tunable rules live here, in one place (requirement: thresholds in one config file).
 * Every number below is explained in plain words so it can be changed with confidence.
 */

// ---------- Status (green / amber / red) ----------
export const STATUS_RULES = {
  /**
   * The main yardstick is the MONTH gap: fund return minus its reference return over the last month,
   * in percentage points. The reference is the fund's benchmark index, or, for the debt fund,
   * the average of similar funds.
   */
  /** Gap at or above this (e.g. -1.0 means "up to 1 point behind") is green. */
  greenMinMonthGap: -1.0,
  /** Gap below greenMinMonthGap but at or above this is amber; below it is red. */
  amberMinMonthGap: -3.0,

  /** A week only counts as "behind" if the fund trailed its reference by more than this many points (ignores tiny noise). */
  weekBehindTolerance: 0.25,
  /** Behind for this many weeks in a row -> at least amber. */
  amberWeeksLagging: 4,
  /** Behind for this many weeks in a row -> red. */
  redWeeksLagging: 8,
} as const;

// ---------- Standing against similar funds (the "Outperforming" label) ----------
export const PEER_STANDING = {
  /** Month gap vs the average of similar funds, in percentage points. At or above this -> "Outperforming". */
  aheadMinMonthGap: 0.5,
  /** At or below this -> "Behind similar funds". In between -> in line (no label). */
  behindMaxMonthGap: -0.5,
  /** Need at least this many similar funds to say anything. */
  minPeers: 2,
} as const;

// ---------- Overall verdict (exact strings; also enforced by a database CHECK constraint) ----------
export const VERDICTS = {
  none: "No action needed",
  watch: "One fund worth watching",
  review: "Consider reviewing your allocation",
} as const;
export type Verdict = (typeof VERDICTS)[keyof typeof VERDICTS];
/** 0 flagged funds -> none; exactly 1 -> watch; 2 or more -> review. "Flagged" = amber or red. */
export const VERDICT_REVIEW_MIN_FLAGGED = 2;

// ---------- Benchmarks ----------
export type BenchmarkConfig = {
  symbol: string;
  /** Currency the index is quoted in. USD indexes are converted to INR before comparing with an Indian fund. */
  currency: "INR" | "USD";
  /**
   * Days the index date lags the Indian NAV date (0 = the NAV dated D is matched with the index close of day D).
   * Tested against four years of the Axis Nasdaq fund's real prices: same-day matching fits best (month error
   * 1.33% vs 1.43% with a one-day lag), so it is 0.
   */
  lagDays: number;
  /**
   * How closely this fund can be expected to follow its index, in percentage points. Some funds (the US fund) price their
   * holdings at a different time of day than the index's official close, which leaves about 1.3% of monthly noise
   * that is not real performance. The status rules widen their thresholds by this much so Meera is only flagged for
   * real, sustained gaps. 0 for funds that copy an Indian index closely.
   */
  trackingAllowance: number;
};

/** Keyed by the benchmark_name stored in the funds table. */
export const BENCHMARKS: Record<string, BenchmarkConfig> = {
  "Nifty 50": { symbol: "^NSEI", currency: "INR", lagDays: 0, trackingAllowance: 0 },
  "Nifty Midcap 150": { symbol: "NIFTYMIDCAP150.NS", currency: "INR", lagDays: 0, trackingAllowance: 0 },
  "Nifty Smallcap 250": { symbol: "NIFTYSMLCAP250.NS", currency: "INR", lagDays: 0, trackingAllowance: 0 },
  "Nasdaq 100": { symbol: "^NDX", currency: "USD", lagDays: 0, trackingAllowance: 1.5 },
};
export const USDINR_SYMBOL = "INR=X";

/** Indexes shown as "market context" in the weekly report (Smallcap 100 is intentionally absent: no free data). */
export const MARKET_CONTEXT_INDEXES: { name: string; symbol: string }[] = [
  { name: "Nifty 50", symbol: "^NSEI" },
  { name: "Nifty Midcap 150", symbol: "NIFTYMIDCAP150.NS" },
  { name: "Nifty Smallcap 250", symbol: "NIFTYSMLCAP250.NS" },
  { name: "Nasdaq 100", symbol: "^NDX" },
];

// ---------- Networking ----------
export const HTTP = { timeoutMs: 15_000, retries: 2, backoffMs: 800 } as const;

// ---------- News ----------
export const NEWS = {
  /** How many headlines we keep and send to Gemini (small payloads only). */
  maxHeadlines: 12,
  /** Only headlines from the last N days. */
  lookbackDays: 7,
} as const;

// ---------- Time ----------
export const IST_OFFSET_MINUTES = 330;
