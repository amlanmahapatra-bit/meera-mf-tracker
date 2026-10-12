/**
 * Building the Gemini prompt and checking its answer. Pure code, unit-tested.
 * Gemini only EXPLAINS numbers that code computed; this file is what enforces that.
 */
import { VERDICTS, type Verdict } from "./config";
import type { ReportInput, ReportLanguage } from "./report-types";

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
const trio = (v: { week: number | null; month: number | null; ytd: number | null } | null) =>
  v ? { week: r2(v.week), month: r2(v.month), ytd: r2(v.ytd) } : null;

/** The facts Gemini is allowed to talk about. Small on purpose (no raw price histories). */
export function buildFacts(input: ReportInput) {
  return {
    weekEnding: input.weekEnding,
    funds: input.funds.map((f) => ({
      schemeCode: f.schemeCode,
      slot: f.slot,
      fundName: f.name,
      dataAsOf: f.asOf,
      status: f.status,
      weeksBehindInARow: f.weeksLagging,
      recentWeeksStatus: (input.recentStatuses[f.schemeCode] ?? []).map((s) => s.status),
      fundReturnsPercent: trio(f.comparison.fund),
      comparedWith: f.comparison.reference === "benchmark" ? f.referenceLabel : "similar funds only (no market index is available for this fund)",
      comparedWithReturnsPercent: trio(f.comparison.reference === "benchmark" ? f.comparison.benchmark : f.comparison.category),
      gapVersusComparedWithPoints: trio(f.comparison.gapVsReference),
      similarFundsAverage: {
        returnsPercent: trio(f.comparison.category),
        gapPoints: trio(f.comparison.gapVsCategory),
        fundsUsed: f.comparison.peersUsed,
        fundsRequested: f.comparison.peersRequested,
      },
      thisWeekSplit: f.comparison.split
        ? { fundMovePercent: r2(f.comparison.split.total), wholeMarketPercent: r2(f.comparison.split.marketPart), fundOnlyPercent: r2(f.comparison.split.fundPart) }
        : null,
      dataNotes: f.dataNotes,
    })),
    marketIndexesThisWeekPercent: input.marketContext.indexMoves.map((m) => ({ name: m.name, week: r2(m.week), month: r2(m.month) })),
    headlines: input.marketContext.news.headlines.map((h) => ({ title: h.title, source: h.source })),
    suggestedVerdict: { verdict: input.verdict, reason: input.verdictReason },
  };
}

export function buildSystemPrompt(language: ReportLanguage): string {
  const lang =
    language === "hinglish"
      ? "Write in simple Hinglish (Hindi words in English letters mixed with English), the way a friendly Indian friend would explain it. Keep numbers and fund names as given."
      : "Write in simple, warm, everyday English.";
  return [
    "You write a calm Saturday-morning mutual fund check-up for Meera, a 28-year-old who has 5 SIPs and is NOT a finance professional. She dislikes jargon.",
    lang,
    "You are given FACTS as JSON. Every number in the facts was computed by code. You only explain them.",
    "HARD RULES:",
    "1. Use ONLY numbers that appear in the FACTS. Never calculate new numbers, never estimate, ROUND every number to exactly one decimal place (0.06 becomes 0.1, 2.28 becomes 2.3). Write percentages like 2.1%.",
    "2. For each fund write EXACTLY three sentences, each a single sentence: (1) how the fund did this week, over the last month and since January; (2) how that compares with what it is compared with (use the words in 'comparedWith', and the average of similar funds, saying how many funds were used); (3) which market events explain the difference, citing ONLY headlines from the FACTS by putting the exact headline title in quotes. If the headlines do not clearly explain the move, say plainly that you don't know. If 'thisWeekSplit' is present, say how much of the move came from the whole market and how much from the fund itself.",
    "3. No jargon: never use the words alpha, beta, Sharpe, volatility, benchmark, outperform, underperform, basis points, CAGR, AUM, expense ratio, NAV. Say 'price' not NAV, 'the market index' or the index's name not 'benchmark', 'behind/ahead of' not 'under/outperformed'.",
    "4. Never give investment advice: no buy, sell, switch, redeem, 'you should', or predictions. Describe, do not advise.",
    "5. Calm, kind tone. Never alarming.",
    "5b. Never write a minus sign or a plus sign in front of a number. Say 'fell 2.1%' or 'down 2.1%' for a loss and 'rose 2.1%' or 'up 2.1%' for a gain, as a friend would. Say 'in line with' when the gap is under 0.15 points (not 'ahead' or 'behind'), and use 'ahead of' / 'behind' only for bigger gaps.",
    "6. Overall: choose 'verdict' as exactly one of: \"No action needed\", \"One fund worth watching\", \"Consider reviewing your allocation\". Start from 'suggestedVerdict' and keep it unless the facts clearly show otherwise. 'verdictReason' is ONE specific sentence naming the fund(s) and the numbers behind it.",
    "7. Return the funds in the same order as the FACTS, each with its schemeCode.",
  ].join("\n");
}

/** The JSON Schema we ask the model to follow (sent as response_format.json_schema.schema, strict). */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    funds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          schemeCode: { type: "integer" },
          sentences: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
        },
        required: ["schemeCode", "sentences"],
        additionalProperties: false,
      },
    },
    verdict: { type: "string", enum: Object.values(VERDICTS) },
    verdictReason: { type: "string" },
  },
  required: ["funds", "verdict", "verdictReason"],
  additionalProperties: false,
} as const;

// ---------- validation ----------

export type GeminiAnswer = { funds: { schemeCode: number; sentences: [string, string, string] }[]; verdict: Verdict; verdictReason: string };
export type ValidationResult = { ok: true; answer: GeminiAnswer } | { ok: false; problems: string[] };

const JARGON = /\b(alpha|beta|sharpe|volatility|benchmark|outperform\w*|underperform\w*|basis points?|bps|cagr|aum|expense ratio|nav)\b/i;
/** A minus or plus sign glued to a number ("-2.6%", "+0.4"): spreadsheet-speak, not plain language. */
const SIGNED_NUMBER = /(?:^|[\s(])[-−–+]\s?\d/;
const ADVICE = /\b(buy|sell|switch|redeem|invest more|you should|i recommend|must exit)\b/i;

/** Numbers like 2.1, -0.35, 1,234 found in text, as absolute values. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Math.abs(Number(m[0].replace(/,/g, "")))).filter((n) => Number.isFinite(n));
}

type NumberToken = { value: number; decimals: number };

/** Numbers in text together with how many decimals were written (2.1 has 1, 2 has 0). */
export function numberTokens(text: string): NumberToken[] {
  return [...text.matchAll(/\d[\d,]*(?:\.(\d+))?/g)]
    .map((m) => ({ value: Math.abs(Number(m[0].replace(/,/g, ""))), decimals: (m[1] ?? "").length }))
    .filter((t) => Number.isFinite(t.value));
}

const key = (value: number, decimals: number) => `${decimals}:${value.toFixed(decimals)}`;

/**
 * Every number in the facts (incl. dates and headlines) at 0, 1 and 2 decimals, plus whole numbers 0-10
 * for counts ("3 weeks", "5 similar funds"). A number written with decimals must match a real figure at the
 * SAME precision, so an invented 7.7 can never sneak through by rounding to a small whole number.
 */
export function allowedNumbers(facts: unknown): Set<string> {
  const set = new Set<string>();
  for (const t of numberTokens(JSON.stringify(facts))) for (const d of [0, 1, 2]) set.add(key(t.value, d));
  for (let i = 0; i <= 10; i++) set.add(key(i, 0));
  return set;
}

const stripQuotes = (s: string) => s.replace(/["“”][^"“”]*["“”]/g, " ");
const sentenceCount = (s: string) => s.trim().split(/(?<=[.!?])\s+(?=[A-Z"“'])/).filter(Boolean).length;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function validateAnswer(raw: unknown, input: ReportInput, facts: unknown): ValidationResult {
  const problems: string[] = [];
  const a = raw as Partial<GeminiAnswer> | null;
  if (!a || typeof a !== "object") return { ok: false, problems: ["The answer was not a JSON object."] };

  const verdicts = Object.values(VERDICTS) as string[];
  if (typeof a.verdict !== "string" || !verdicts.includes(a.verdict)) problems.push(`verdict must be exactly one of: ${verdicts.join(" | ")}`);
  if (typeof a.verdictReason !== "string" || !a.verdictReason.trim()) problems.push("verdictReason is missing.");
  else if (sentenceCount(a.verdictReason) !== 1) problems.push("verdictReason must be ONE sentence.");

  if (!Array.isArray(a.funds)) return { ok: false, problems: [...problems, "funds must be an array."] };
  const wanted = input.funds.map((f) => f.schemeCode);
  const got = a.funds.map((f) => f?.schemeCode);
  if (got.length !== wanted.length || wanted.some((c) => !got.includes(c)) || new Set(got).size !== got.length) {
    problems.push(`funds must contain exactly these schemeCodes once each: ${wanted.join(", ")}`);
  }

  const allowed = allowedNumbers(facts);
  const titles = input.marketContext.news.headlines.map((h) => norm(h.title));
  const texts: { where: string; text: string }[] = [];
  for (const f of a.funds) {
    const s = f?.sentences;
    if (!Array.isArray(s) || s.length !== 3 || s.some((x) => typeof x !== "string" || !x.trim())) {
      problems.push(`Fund ${f?.schemeCode}: exactly three non-empty sentences are required.`);
      continue;
    }
    s.forEach((x, i) => {
      if (sentenceCount(x) !== 1) problems.push(`Fund ${f.schemeCode}, sentence ${i + 1}: must be exactly one sentence.`);
      texts.push({ where: `Fund ${f.schemeCode}, sentence ${i + 1}`, text: x });
    });
  }
  if (typeof a.verdictReason === "string") texts.push({ where: "verdictReason", text: a.verdictReason });

  // The "market or fund?" split is the signature feature: when we computed one, sentence 3 must state the market's part.
  for (const f of a.funds) {
    const src = input.funds.find((x) => x.schemeCode === f?.schemeCode);
    const third = Array.isArray(f?.sentences) ? f.sentences[2] : undefined;
    if (src?.comparison.split && typeof third === "string") {
      const market = Math.abs(src.comparison.split.marketPart).toFixed(1);
      if (!numbersIn(third).some((n) => n.toFixed(1) === market)) {
        problems.push(`Fund ${f.schemeCode}, sentence 3: must say how much of this week's move (${market}%) came from the whole market and how much from the fund itself.`);
      }
    }
  }

  for (const { where, text } of texts) {
    const plain = stripQuotes(text);
    if (JARGON.test(plain)) problems.push(`${where}: uses jargon ("${JARGON.exec(plain)![0]}"). Use plain words.`);
    if (ADVICE.test(plain)) problems.push(`${where}: gives advice ("${ADVICE.exec(plain)![0]}"). Describe only.`);
    if (SIGNED_NUMBER.test(plain)) problems.push(`${where}: has a minus or plus sign in front of a number. Write "fell 2.1%" or "rose 2.1%" instead.`);
    for (const t of numberTokens(plain)) {
      if (t.decimals > 1) {
        problems.push(`${where}: the number ${t.value.toFixed(t.decimals)} has too many decimals. Round to one decimal place (for example ${t.value.toFixed(1)}%).`);
        continue;
      }
      if (!allowed.has(key(t.value, t.decimals))) {
        problems.push(`${where}: the number ${t.value.toFixed(t.decimals)} is not in the facts.`);
      }
    }
    for (const q of text.matchAll(/["“]([^"“”]{8,})["”]/g)) {
      const quoted = norm(q[1]).replace(/[.,]$/, "");
      if (!titles.some((t) => t.includes(quoted) || quoted.includes(t))) problems.push(`${where}: quotes "${q[1]}" which is not one of the provided headlines.`);
    }
  }

  if (problems.length) return { ok: false, problems: [...new Set(problems)].slice(0, 12) };
  return { ok: true, answer: a as GeminiAnswer };
}
