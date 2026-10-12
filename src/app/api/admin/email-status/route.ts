import { isAdminAuthorized, slowDown, unauthorized } from "@/lib/auth";
import { emailStatus } from "@/lib/pipeline/email";

/** Is the Saturday email ready? Shows masked addresses only. Passcode protected. */
export async function GET(req: Request) {
  if (!isAdminAuthorized(req)) {
    await slowDown();
    return unauthorized("Wrong or missing passcode.");
  }
  try {
    return Response.json({ ok: true, ...(await emailStatus()) });
  } catch {
    return Response.json({ ok: false, error: "Could not read the email settings just now." }, { status: 500 });
  }
}
