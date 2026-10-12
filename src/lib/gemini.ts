/**
 * Gemini Flash is the ONLY AI used in this app (exam rule). REST call, no SDK, no Claude/Anthropic API.
 * Model name verified in Google's model list and against the API (models.get) with our key.
 */
import { requireEnv } from "./env";
import { fetchRetry } from "./http";
import { buildFacts, buildSystemPrompt, RESPONSE_SCHEMA, validateAnswer, type GeminiAnswer } from "./gemini-validate";
import type { ReportInput, ReportLanguage } from "./report-types";

/**
 * Gemini Flash models, tried in order. The newest is first; if it is busy or slow we fall back to the
 * next one so the Saturday report never stalls. (All are "Flash", so the exam rule holds.)
 * Override with GEMINI_MODELS="a,b,c". Names verified against Google's model list and the live API.
 */
export const GEMINI_MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash")
  .split(",").map((m) => m.trim()).filter(Boolean);

type GenerateOptions = {
  jsonSchema?: boolean;
  temperature?: number;
  /** Absolute time (ms since epoch) after which we stop trying. */
  deadline?: number;
  /** Longest we wait for any single model before moving to the next. */
  perModelTimeoutMs?: number;
  /** Start with this model (the one that answered last time), then the rest. */
  preferModel?: string;
};

export type GeminiText = { text: string; model: string };

/**
 * One request to Gemini, walking down the model list on trouble (busy, slow, rate-limited, unavailable).
 * Returns the answer text and which model gave it. Throws only when every model has failed or time ran out.
 */
export async function geminiGenerate(system: string, user: string, opts: GenerateOptions = {}): Promise<GeminiText> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    // Short reasoning is plenty for explaining numbers and keeps the call fast and cheap.
    thinkingConfig: { thinkingLevel: "low" },
  };
  if (opts.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = RESPONSE_SCHEMA;
  }
  const body = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig });
  const order = opts.preferModel ? [opts.preferModel, ...GEMINI_MODELS.filter((m) => m !== opts.preferModel)] : GEMINI_MODELS;
  const deadline = opts.deadline ?? Date.now() + 55_000;
  const problems: string[] = [];
  const tooSlow = new Set<string>(); // a model that hangs is skipped for the rest of this call
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Busy-server errors (503) come and go within seconds, so we cycle through the models a few times
  // with a short pause, instead of giving up after one pass.
  for (let round = 0; round < 4; round++) {
    for (const model of order) {
      if (tooSlow.has(model)) continue;
      const remaining = deadline - Date.now();
      if (remaining < 3_000) throw new Error(`No Gemini model answered in time. ${problems.slice(-4).join("; ")}`);
      try {
        const res = await fetchRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": requireEnv("GEMINI_API_KEY") },
          body,
          timeoutMs: Math.min(opts.perModelTimeoutMs ?? 20_000, remaining),
          retries: 0,
        });
        if (!res.ok) {
          const errText = (await res.text()).replace(/\s+/g, " ");
          const dailyLimit = res.status === 429 && /PerDay/i.test(errText);
          const retryIn = /retry in ([0-9hms.]+)/i.exec(errText)?.[1];
          problems.push(dailyLimit ? `${model}: today's free limit is used up${retryIn ? ` (resets in about ${retryIn.replace(/\.\d+s/, "s")})` : ""}` : `${model}: HTTP ${res.status} ${errText.slice(0, 100)}`);
          // Daily limit, unknown model or bad request: asking again cannot help, so stop using this model.
          if (dailyLimit || res.status === 404 || res.status === 400) tooSlow.add(model);
          else await pause(1_500);
          continue;
        }
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
        const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
        if (!text) { problems.push(`${model}: empty answer (${j.promptFeedback?.blockReason ?? j.candidates?.[0]?.finishReason ?? "no reason"})`); continue; }
        return { text, model };
      } catch (e) {
        const slow = (e as Error).message.includes("timeout") || (e as Error).name === "TimeoutError";
        problems.push(`${model}: ${slow ? "too slow" : (e as Error).message}`);
        if (slow) tooSlow.add(model);
      }
    }
    if (order.every((m) => tooSlow.has(m))) break;
  }
  throw new Error(`No Gemini model answered. ${problems.slice(-4).join("; ")}`);
}

export type GeminiReportOutcome = { ok: true; answer: GeminiAnswer; attempts: number; model: string } | { ok: false; reason: string; attempts: number };

/**
 * Asks Gemini for the report text. Up to two attempts: if the first answer fails validation,
 * the second attempt is told exactly what was wrong. Never throws; the caller falls back to the template.
 */
export async function generateReportText(input: ReportInput, language: ReportLanguage = "en"): Promise<GeminiReportOutcome> {
  const facts = buildFacts(input);
  const system = buildSystemPrompt(language);
  const base = `FACTS:\n${JSON.stringify(facts, null, 1)}`;
  const deadline = Date.now() + 55_000; // whole Gemini step, so the weekly job fits a serverless time limit
  let feedback = "";
  let lastReason = "unknown";
  let model: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await geminiGenerate(system, base + feedback, { jsonSchema: true, deadline, preferModel: model });
      model = out.model;
      let parsed: unknown;
      try {
        parsed = JSON.parse(out.text);
      } catch {
        lastReason = "Gemini's answer was not valid JSON.";
        feedback = "\n\nYour previous answer was not valid JSON. Return only the JSON object.";
        continue;
      }
      const checked = validateAnswer(parsed, input, facts);
      if (checked.ok) return { ok: true, answer: checked.answer, attempts: attempt, model: out.model };
      lastReason = `Gemini's answer failed checks: ${checked.problems.join(" ")}`;
      feedback = `\n\nYour previous answer was rejected for these reasons. Fix every one and answer again:\n- ${checked.problems.join("\n- ")}`;
    } catch (e) {
      lastReason = (e as Error).message;
      break; // every model failed or time is up; retrying would not help
    }
  }
  return { ok: false, reason: lastReason, attempts: 2 };
}
