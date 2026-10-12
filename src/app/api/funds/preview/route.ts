import { errorResponse } from "@/lib/api";
import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { UserFacingError, previewFund } from "@/lib/funds-service";

/** Looks up a scheme code and suggests a slot and index (to pre-fill the form). Saves nothing. */
export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  try {
    const code = Number(new URL(req.url).searchParams.get("code"));
    if (!Number.isInteger(code) || code < 1) throw new UserFacingError("Please enter a valid scheme code (a whole number).");
    return Response.json({ ok: true, fund: await previewFund(code) });
  } catch (e) {
    return errorResponse(e);
  }
}
