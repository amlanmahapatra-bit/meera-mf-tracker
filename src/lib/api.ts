import { UserFacingError } from "./funds-service";

/** One place that turns errors into safe JSON: plain-language messages for expected problems, a generic one otherwise. */
export function errorResponse(e: unknown): Response {
  if (e instanceof UserFacingError) return Response.json({ ok: false, error: e.message }, { status: e.status });
  console.error("API error:", e);
  return Response.json({ ok: false, error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
}
