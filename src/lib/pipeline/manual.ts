import { runDailyNav } from "./daily";
import type { JobOutcome } from "./run";
import { runWeekly } from "./weekly";

/**
 * "Run now": the whole pipeline in order. The daily step saves prices and index closes (backfilling full
 * history the first time), then the weekly step builds and stores the report. Safe to repeat.
 */
export async function runEverything(): Promise<JobOutcome> {
  const daily = await runDailyNav();
  const weekly = await runWeekly();
  return {
    status: daily.status === "success" && weekly.status === "success" ? "success" : "partial",
    details: { daily: daily.details, weekly: weekly.details },
  };
}
