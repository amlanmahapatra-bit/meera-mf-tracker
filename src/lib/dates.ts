import { IST_OFFSET_MINUTES } from "./config";
import { addDays } from "./returns";

/** Today's date in India (YYYY-MM-DD). Cron servers run in UTC, so this matters around midnight. */
export function istToday(now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/**
 * The Saturday a report belongs to: today if today is Saturday, otherwise the most recent Saturday.
 * Running the pipeline again any time that week targets the same week, so stored rows are updated, not duplicated.
 */
export function weekEndingFor(isoDate: string): string {
  const dow = new Date(isoDate + "T00:00:00Z").getUTCDay(); // 0 = Sunday ... 6 = Saturday
  return addDays(isoDate, -((dow + 1) % 7));
}
