import { errorResponse } from "@/lib/api";
import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { UserFacingError } from "@/lib/funds-service";
import { searchFunds } from "@/lib/sources/mfapi";

/** Search by fund NAME. Only Direct + Growth plans are returned (IDCW, Dividend and Bonus plans are hidden). */
export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  try {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (q.trim().length < 3) throw new UserFacingError("Please type at least 3 letters of the fund's name.");
    const results = await searchFunds(q);
    return Response.json({ ok: true, results, note: results.length === 0 ? "No Direct Growth funds matched. Try fewer or different words." : undefined });
  } catch (e) {
    return errorResponse(e);
  }
}
