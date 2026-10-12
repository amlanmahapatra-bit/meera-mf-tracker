import { isCronAuthorized, unauthorized } from "@/lib/auth";
import { withRun } from "@/lib/pipeline/run";
import { runDailyNav } from "@/lib/pipeline/daily";
import { catchUpWeeklyEmail } from "@/lib/pipeline/catchup";
import { istToday } from "@/lib/dates";

export const maxDuration = 300; // normally ~10 s; longer only on the rare day it has to re-send a missed Saturday email

/** Vercel Cron calls this every day (see vercel.json). Needs "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return unauthorized();
  const result = await withRun("daily_nav", runDailyNav);
  // Safety net: on the days after a Saturday, make sure that week's email really went out (re-sends it if not).
  const catchUp = await catchUpWeeklyEmail(istToday()).catch((e) => ({ action: "check_failed" as const, detail: (e as Error).message }));
  return Response.json({ ok: result.status !== "failed", ...result, weeklyEmailCheck: catchUp }, { status: result.status === "failed" ? 500 : 200 });
}
