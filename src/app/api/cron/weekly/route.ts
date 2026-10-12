import { isCronAuthorized, unauthorized } from "@/lib/auth";
import { withRun } from "@/lib/pipeline/run";
import { runWeekly } from "@/lib/pipeline/weekly";

export const maxDuration = 120;

/** Vercel Cron calls this on Saturday mornings (India time). Needs "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return unauthorized();
  const result = await withRun("weekly_report", () => runWeekly());
  return Response.json({ ok: result.status !== "failed", ...result }, { status: result.status === "failed" ? 500 : 200 });
}
