/**
 * Safety net for the Saturday email. Vercel's free plan allows only two cron jobs, so instead of a third one the
 * daily job checks, on the 3 days after a Saturday, whether that Saturday's email really went out. If it did not
 * (Resend down, a crash, a late timer...), it builds the same week's report again and sends it. Already sent means nothing happens.
 */
import { daysBetween } from "../returns";
import { weekEndingFor } from "../dates";
import { getSupabase } from "../supabase";
import { readEmailConfig } from "./email";
import { withRun, type JobResult } from "./run";
import { runWeekly } from "./weekly";

/** Days after the Saturday on which a missed email is still retried (1 = Sunday ... 3 = Tuesday). */
export const CATCH_UP_DAYS = [1, 2, 3];

/** The Saturday that needs checking today, or null when today is not a catch-up day. */
export function catchUpWeek(todayIso: string): string | null {
  const week = weekEndingFor(todayIso);
  return CATCH_UP_DAYS.includes(daysBetween(week, todayIso)) ? week : null;
}

export type CatchUpDeps = {
  emailReady: () => boolean;
  alreadySent: (weekEnding: string) => Promise<boolean>;
  runWeek: (weekEnding: string) => Promise<JobResult>;
};

const realDeps: CatchUpDeps = {
  emailReady: () => !("missing" in readEmailConfig()),
  async alreadySent(weekEnding) {
    const { data, error } = await getSupabase().from("email_log").select("id").eq("kind", "weekly_report").eq("week_ending", weekEnding).in("status", ["sent", "sending"]).limit(1);
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  },
  runWeek: (weekEnding) => withRun("weekly_report", () => runWeekly({ weekEnding, sendEmail: true })),
};

export type CatchUpOutcome = { action: "not_needed" | "already_sent" | "email_not_set_up" | "retried" | "check_failed"; weekEnding?: string; detail?: string };

export async function catchUpWeeklyEmail(todayIso: string, deps: CatchUpDeps = realDeps): Promise<CatchUpOutcome> {
  const week = catchUpWeek(todayIso);
  if (!week) return { action: "not_needed" };
  if (!deps.emailReady()) return { action: "email_not_set_up", weekEnding: week };
  try {
    if (await deps.alreadySent(week)) return { action: "already_sent", weekEnding: week };
  } catch (e) {
    return { action: "check_failed", weekEnding: week, detail: (e as Error).message }; // never send blind: could cause a duplicate
  }
  const r = await deps.runWeek(week);
  return { action: "retried", weekEnding: week, detail: r.skipped ?? r.error ?? r.status };
}
