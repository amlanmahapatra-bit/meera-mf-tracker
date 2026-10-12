import { errorResponse } from "@/lib/api";
import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { parseAddFundInput } from "@/lib/funds";
import { addFund, listFunds, removeFund, UserFacingError } from "@/lib/funds-service";

export const maxDuration = 60;

/** Public: the list of funds being tracked. */
export async function GET() {
  try {
    return Response.json({ ok: true, funds: await listFunds() });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Add a fund. Body: { schemeCode, slot, benchmarkName? }. Needs the admin passcode. */
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  try {
    const parsed = parseAddFundInput(await req.json().catch(() => null));
    if (!parsed.ok) throw new UserFacingError(parsed.error);
    return Response.json({ ok: true, added: await addFund(parsed.value) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Remove a fund (switches it off; history is kept). Body: { schemeCode }. Needs the admin passcode. */
export async function DELETE(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  try {
    const body = (await req.json().catch(() => null)) as { schemeCode?: unknown } | null;
    const code = Number(body?.schemeCode);
    if (!Number.isInteger(code) || code < 1) throw new UserFacingError("Please say which fund to remove (its scheme code).");
    return Response.json({ ok: true, removed: await removeFund(code) });
  } catch (e) {
    return errorResponse(e);
  }
}
