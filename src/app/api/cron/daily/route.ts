import { isCronAuthorized, unauthorized } from "@/lib/auth";
import { withRun } from "@/lib/pipeline/run";
import { runDailyNav } from "@/lib/pipeline/daily";

export const maxDuration = 60;

/** Vercel Cron calls this every day (see vercel.json). Needs "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return unauthorized();
  const result = await withRun("daily_nav", runDailyNav);
  return Response.json({ ok: result.status !== "failed", ...result }, { status: result.status === "failed" ? 500 : 200 });
}
