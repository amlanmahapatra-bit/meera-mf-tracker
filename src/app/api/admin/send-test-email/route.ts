import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { sendTestEmail } from "@/lib/pipeline/email";
import { getLatestReport } from "@/lib/queries";

export const maxDuration = 60;

/** Sends the latest check-up to the configured address(es), clearly marked as a test. Passcode protected. */
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  try {
    const loaded = await getLatestReport();
    if (!loaded) return Response.json({ ok: false, error: "There is no check-up to send yet. Press \"Update now\" first." }, { status: 409 });
    const out = await sendTestEmail(loaded.report);
    return Response.json({ ok: out.status === "sent", ...out }, { status: out.status === "failed" ? 502 : 200 });
  } catch {
    return Response.json({ ok: false, error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
}
