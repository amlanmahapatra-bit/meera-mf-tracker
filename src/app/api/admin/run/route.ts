import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { runEverything } from "@/lib/pipeline/manual";
import { withRun } from "@/lib/pipeline/run";

export const maxDuration = 300;

/** "Run now": saves prices, builds the report. Protected by the admin passcode (header x-admin-passcode). */
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  const result = await withRun("manual_run", runEverything);
  return Response.json({ ok: result.status !== "failed", ...result }, { status: result.status === "failed" ? 500 : 200 });
}
