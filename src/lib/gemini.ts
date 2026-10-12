/**
 * All AI in this app is Google Gemini Flash, reached ONLY through the OpenRouter gateway
 * (the project's rules: google/ models only, never Google AI Studio / Vertex directly, never another vendor).
 * No SDK: one fetch call. The key is read from the OPENROUTER_API_KEY environment variable.
 * Request format read from OpenRouter's docs (api_reference/overview, structured-outputs, provider-selection, errors).
 */
import { requireEnv } from "./env";
import { buildFacts, buildSystemPrompt, RESPONSE_SCHEMA, validateAnswer, type GeminiAnswer } from "./gemini-validate";
import type { ReportInput, ReportLanguage } from "./report-types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Models in the order we try them. google/gemini-3.7-flash is the default "fast and cheap" model;
 * google/gemini-3.8-flash is the newest Flash. Override with AI_MODELS="a,b" (must all start with "google/").
 */
export function parseModels(value: string | undefined): string[] {
  const models = (value || "google/gemini-3.7-flash,google/gemini-3.8-flash").split(",").map((m) => m.trim()).filter(Boolean);
  const bad = models.filter((m) => !m.startsWith("google/"));
  if (bad.length || models.length === 0) throw new Error(`Only Google models are allowed (ids starting with "google/"). Not allowed: ${bad.join(", ") || "(empty list)"}`);
  return models;
}
export const AI_MODELS = parseModels(process.env.AI_MODELS);

/** Rule: Google's own infrastructure must serve every request, with no fallback to other providers. */
export const PROVIDER_RULE = { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false } as const;

const MAX_RETRIES = 3; // on 429 and 5xx, with backoff
const BACKOFF_MS = 1_000;

export type AiErrorKind = "out_of_credits" | "bad_key" | "busy" | "slow" | "rejected" | "empty" | "out_of_time" | "all_failed";
export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
  }
}

export type AiUsage = { calls: number; promptTokens: number; completionTokens: number; billedCredits: number; upstreamCostUsd: number };
export const emptyUsage = (): AiUsage => ({ calls: 0, promptTokens: 0, completionTokens: 0, billedCredits: 0, upstreamCostUsd: 0 });
export type AiText = { text: string; model: string; usage: AiUsage };

type GenerateOptions = {
  jsonSchema?: boolean;
  temperature?: number;
  /** Absolute time (ms since epoch) after which we stop trying. */
  deadline?: number;
  /** Start with this model (the one that answered last time), then the rest. */
  preferModel?: string;
  models?: string[];
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type OpenRouterResponse = {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; cost_details?: { upstream_inference_cost?: number } };
  error?: { message?: string };
};

/** One model, with up to 3 retries on 429 / 5xx (honouring Retry-After). 402 stops everything. */
async function callModel(model: string, requestBody: Record<string, unknown>, deadline: number): Promise<AiText> {
  const key = requireEnv("OPENROUTER_API_KEY");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) throw new AiError("out_of_time", "ran out of time");
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Meera's Money Check" },
        body: JSON.stringify({ ...requestBody, model }),
        signal: AbortSignal.timeout(Math.min(40_000, remaining)),
      });
    } catch (e) {
      if ((e as Error).name === "TimeoutError" || (e as Error).message.includes("timeout")) throw new AiError("slow", `${model}: too slow`);
      if (attempt === MAX_RETRIES) throw new AiError("busy", `${model}: network error (${(e as Error).message})`);
      await pause(BACKOFF_MS * 2 ** attempt);
      continue;
    }
    if (res.status === 402) throw new AiError("out_of_credits", "OpenRouter credits are used up (HTTP 402)");
    if (res.status === 401 || res.status === 403) throw new AiError("bad_key", `OpenRouter refused the key or request (HTTP ${res.status})`);
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES) throw new AiError("busy", `${model}: HTTP ${res.status} after ${MAX_RETRIES + 1} tries`);
      const retryAfter = Number(res.headers.get("retry-after"));
      await pause(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1_000 : BACKOFF_MS * 2 ** attempt);
      continue;
    }
    const j = (await res.json().catch(() => ({}))) as OpenRouterResponse;
    if (!res.ok) throw new AiError("rejected", `${model}: HTTP ${res.status} ${(j.error?.message ?? "").slice(0, 160)}`);
    const text = (j.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new AiError("empty", `${model}: empty answer (${j.choices?.[0]?.finish_reason ?? "no reason"})`);
    const u = j.usage ?? {};
    return {
      text,
      model: j.model ?? model,
      usage: {
        calls: 1,
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        billedCredits: u.cost ?? 0,
        upstreamCostUsd: u.cost_details?.upstream_inference_cost ?? 0,
      },
    };
  }
  throw new AiError("busy", `${model}: gave up`);
}

/** Walks the model list until one answers. Out-of-credits and bad-key errors stop immediately. */
export async function geminiGenerate(system: string, user: string, opts: GenerateOptions = {}): Promise<AiText> {
  const body: Record<string, unknown> = {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: opts.temperature ?? 0.3,
    // Short reasoning is plenty for explaining numbers (and it is most of the cost). max_tokens covers
    // reasoning + answer together, so it is kept generous.
    reasoning: { effort: "low" },
    max_tokens: 8_000,
    provider: { ...PROVIDER_RULE },
  };
  if (opts.jsonSchema) {
    body.response_format = { type: "json_schema", json_schema: { name: "weekly_report", strict: true, schema: RESPONSE_SCHEMA } };
    // Never route to an endpoint that would silently ignore the schema.
    (body.provider as Record<string, unknown>).require_parameters = true;
  }
  const list = opts.models ?? AI_MODELS;
  const order = opts.preferModel && list.includes(opts.preferModel) ? [opts.preferModel, ...list.filter((m) => m !== opts.preferModel)] : list;
  const deadline = opts.deadline ?? Date.now() + 55_000;
  const problems: string[] = [];
  for (const model of order) {
    try {
      return await callModel(model, body, deadline);
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      if (e.kind === "out_of_credits" || e.kind === "bad_key") throw e;
      problems.push(e.message);
      if (e.kind === "out_of_time") break;
    }
  }
  throw new AiError("all_failed", `No Gemini model answered. ${problems.join("; ")}`);
}

export type GeminiReportOutcome =
  | { ok: true; answer: GeminiAnswer; attempts: number; model: string; usage: AiUsage }
  | { ok: false; reason: string; attempts: number; usage: AiUsage };

const addUsage = (a: AiUsage, b: AiUsage): AiUsage => ({
  calls: a.calls + b.calls,
  promptTokens: a.promptTokens + b.promptTokens,
  completionTokens: a.completionTokens + b.completionTokens,
  billedCredits: a.billedCredits + b.billedCredits,
  upstreamCostUsd: a.upstreamCostUsd + b.upstreamCostUsd,
});

/**
 * Asks for the report text. Up to two attempts: if the first answer fails validation, the second is told
 * exactly what was wrong. Never throws; the caller falls back to the template and records the reason.
 */
export async function generateReportText(input: ReportInput, language: ReportLanguage = "en"): Promise<GeminiReportOutcome> {
  const facts = buildFacts(input);
  const system = buildSystemPrompt(language);
  const base = `FACTS:\n${JSON.stringify(facts, null, 1)}`;
  const deadline = Date.now() + 55_000; // whole AI step, so the weekly job fits a serverless time limit
  let feedback = "";
  let lastReason = "unknown";
  let model: string | undefined;
  let usage = emptyUsage();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await geminiGenerate(system, base + feedback, { jsonSchema: true, deadline, preferModel: model });
      model = out.model;
      usage = addUsage(usage, out.usage);
      let parsed: unknown;
      try {
        parsed = JSON.parse(out.text);
      } catch {
        lastReason = "The answer was not valid JSON.";
        feedback = "\n\nYour previous answer was not valid JSON. Return only the JSON object.";
        continue;
      }
      const checked = validateAnswer(parsed, input, facts);
      if (checked.ok) return { ok: true, answer: checked.answer, attempts: attempt, model: out.model, usage };
      lastReason = `The answer failed checks: ${checked.problems.join(" ")}`;
      feedback = `\n\nYour previous answer was rejected for these reasons. Fix every one and answer again:\n- ${checked.problems.join("\n- ")}`;
    } catch (e) {
      lastReason = (e as Error).message;
      break; // every model failed, credits ran out, or time is up; retrying would not help
    }
  }
  return { ok: false, reason: lastReason, attempts: 2, usage };
}
