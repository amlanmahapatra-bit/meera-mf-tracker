import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { runBackfill } from "@/lib/pipeline/backfill";
import { withRun } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** Fills in past weeks of history for the trend chart (default 5 years). Safe to repeat. Passcode protected. */
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  const years = Number(new URL(req.url).searchParams.get("years") ?? 5);
  const result = await withRun("backfill", () => runBackfill({ years: Number.isFinite(years) ? years : 5 }));
  return Response.json({ ok: result.status !== "failed", ...result }, { status: result.status === "failed" ? 500 : 200 });
}
