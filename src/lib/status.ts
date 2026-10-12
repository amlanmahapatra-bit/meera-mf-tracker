/**
 * Traffic-light status per fund and the overall candidate verdict.
 * Deterministic rules; thresholds come from config.ts. The AI never decides these.
 */
import { STATUS_RULES, VERDICTS, VERDICT_REVIEW_MIN_FLAGGED, type Verdict } from "./config";

export type Status = "green" | "amber" | "red" | "unknown";

/** Was this week "behind"? null when we cannot tell (no gap available). */
export function isBehindThisWeek(weekGap: number | null): boolean | null {
  return weekGap === null ? null : weekGap < -STATUS_RULES.weekBehindTolerance;
}

/**
 * Consecutive weeks behind. Behind this week -> previous count + 1; not behind -> 0;
 * unknown -> keep the previous count (missing data neither starts nor ends a streak).
 */
export function nextWeeksLagging(previous: number, weekGap: number | null): number {
  const behind = isBehindThisWeek(weekGap);
  if (behind === null) return previous;
  return behind ? previous + 1 : 0;
}

const RANK: Record<Status, number> = { unknown: 0, green: 1, amber: 2, red: 3 };
const worst = (a: Status, b: Status): Status => (RANK[a] >= RANK[b] ? a : b);

/** Status from the month gap (points vs reference) and how many weeks in a row the fund has been behind. */
export function fundStatus(monthGap: number | null, weeksLagging: number): Status {
  let byGap: Status = "unknown";
  if (monthGap !== null) {
    byGap = monthGap >= STATUS_RULES.greenMinMonthGap ? "green" : monthGap >= STATUS_RULES.amberMinMonthGap ? "amber" : "red";
  }
  let byStreak: Status = "green";
  if (weeksLagging >= STATUS_RULES.redWeeksLagging) byStreak = "red";
  else if (weeksLagging >= STATUS_RULES.amberWeeksLagging) byStreak = "amber";
  // With no gap data, only a long streak can raise a flag; otherwise we honestly say "unknown".
  if (byGap === "unknown") return byStreak === "green" ? "unknown" : byStreak;
  return worst(byGap, byStreak);
}

export type FundFlagInput = {
  slot: string;
  status: Status;
  monthGap: number | null;
  weeksLagging: number;
  /** Plain words for what the fund is compared with, e.g. "the Nifty 50" or "similar funds". */
  referenceLabel: string;
};

export type CandidateVerdict = { verdict: Verdict; reason: string; flaggedSlots: string[] };

const pts = (n: number) => `${Math.abs(n).toFixed(1)} point${Math.abs(n).toFixed(1) === "1.0" ? "" : "s"}`;

function flagSentence(f: FundFlagInput): string {
  const parts: string[] = [];
  if (f.monthGap !== null && f.monthGap < STATUS_RULES.greenMinMonthGap) {
    parts.push(`${pts(f.monthGap)} behind ${f.referenceLabel} over the last month`);
  }
  if (f.weeksLagging >= STATUS_RULES.amberWeeksLagging) {
    parts.push(`behind for ${f.weeksLagging} weeks in a row`);
  }
  return `Your ${f.slot} fund is ${parts.join(" and ") || "slightly off track"}`;
}

/** Overall suggestion from the statuses. 0 flagged -> none, 1 -> watch, 2+ -> review. */
export function candidateVerdict(funds: FundFlagInput[]): CandidateVerdict {
  const flagged = funds.filter((f) => f.status === "amber" || f.status === "red");
  const unknown = funds.filter((f) => f.status === "unknown").length;
  const note = unknown > 0 ? ` (${unknown} fund${unknown > 1 ? "s" : ""} could not be checked this week)` : "";

  if (flagged.length === 0) {
    return { verdict: VERDICTS.none, reason: `All your funds are keeping pace with what they are compared against${note}.`, flaggedSlots: [] };
  }
  const slots = flagged.map((f) => f.slot);
  if (flagged.length < VERDICT_REVIEW_MIN_FLAGGED) {
    return { verdict: VERDICTS.watch, reason: `${flagSentence(flagged[0])}; the rest are on track${note}.`, flaggedSlots: slots };
  }
  const worstFund = [...flagged].sort((a, b) => RANK[b.status] - RANK[a.status] || (a.monthGap ?? 0) - (b.monthGap ?? 0))[0];
  return {
    verdict: VERDICTS.review,
    reason: `${flagged.length} of your funds are behind (${slots.join(", ")}). ${flagSentence(worstFund)}${note}.`,
    flaggedSlots: slots,
  };
}
