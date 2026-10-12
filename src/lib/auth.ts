import { timingSafeEqual } from "node:crypto";
import { optionalEnv } from "./env";

/** Compares two secrets without leaking, through timing, how many leading characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) {
    timingSafeEqual(A, A); // keep the time roughly constant even on a length mismatch
    return false;
  }
  return timingSafeEqual(A, B);
}

/** Cron routes: Vercel sends "Authorization: Bearer <CRON_SECRET>". Missing secret = always refuse. */
export function isCronAuthorized(req: Request): boolean {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

/** Admin routes: the passcode arrives in the "x-admin-passcode" header. Missing passcode setting = always refuse. */
export function isAdminAuthorized(req: Request): boolean {
  const passcode = optionalEnv("ADMIN_PASSCODE");
  if (!passcode) return false;
  return safeEqual(req.headers.get("x-admin-passcode") ?? "", passcode);
}

export const unauthorized = (message = "Not allowed.") => Response.json({ ok: false, error: message }, { status: 401 });

/** A short pause on a wrong passcode makes guessing slow without any extra infrastructure. */
export const slowDown = () => new Promise((r) => setTimeout(r, 600));
