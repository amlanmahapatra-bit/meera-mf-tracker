import { errorResponse } from "@/lib/api";
import { askAboutMoney, MAX_QUESTION_CHARS } from "@/lib/ask";
import { UserFacingError } from "@/lib/funds-service";
import { getLatestReport } from "@/lib/queries";

export const maxDuration = 60;

// A simple brake so nobody can run up the AI bill: 12 questions per hour per visitor (per server instance).
const WINDOW_MS = 60 * 60 * 1000, LIMIT = 12;
const hits = new Map<string, number[]>();
function tooMany(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return false;
}

/** "Ask about my money": answers from the stored weekly report and its headlines only. */
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (tooMany(ip)) throw new UserFacingError("That is a lot of questions in a short time. Please try again in a little while.", 429);
    const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
    const question = typeof body?.question === "string" ? body.question.replace(/\s+/g, " ").trim() : "";
    if (question.length < 3) throw new UserFacingError("Please type your question first.");
    if (question.length > MAX_QUESTION_CHARS) throw new UserFacingError(`Please keep your question under ${MAX_QUESTION_CHARS} letters.`);
    const loaded = await getLatestReport();
    if (!loaded) throw new UserFacingError("There is no report yet, so there is nothing to ask about. Your first one is made on Saturday.", 404);
    const r = await askAboutMoney(question, loaded.report);
    if (!r.ok) return Response.json({ ok: false, error: r.message }, { status: r.reason === "unavailable" ? 503 : 200 });
    return Response.json({ ok: true, answer: r.answer, weekEnding: r.weekEnding });
  } catch (e) {
    return errorResponse(e);
  }
}
