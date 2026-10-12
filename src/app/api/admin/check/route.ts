import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";

/** Lets the form check the passcode once, so Meera finds out about a typo straight away. */
export async function POST(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("That passcode is not right.");
  }
  return Response.json({ ok: true });
}
