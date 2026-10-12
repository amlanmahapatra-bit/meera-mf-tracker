/**
 * Building the Gemini prompt and checking its answer. Pure code, unit-tested.
 * Gemini only EXPLAINS numbers that code computed; this file is what enforces that.
 */
import { VERDICTS, type Verdict } from "./config";
import { gapWords } from "./report-template";
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
      // Decided by code from the LAST MONTH gaps (the same numbers the screen uses), so words and labels never disagree.
      monthComparison: {
        withComparedWith: f.comparison.reference === "benchmark" ? gapWords(f.comparison.gapVsReference.month) : null,
        withSimilarFunds: f.comparison.peersUsed > 0 ? gapWords(f.comparison.gapVsCategory.month) : null,
      },
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
      : "Write in very simple, warm, everyday English, like talking to a friend over chai.";
  return [
    "You write a calm Saturday-morning check-up on mutual funds for Meera, a 28-year-old who has never studied finance and dislikes jargon. She wants to know, in very simple words, what each fund looks like this week.",
    lang,
    "You are given FACTS as JSON. Every number in the facts was computed by code. You only explain them in plain words.",
    "RULES:",
    "1. For each fund write EXACTLY three SHORT sentences, each one sentence of at most 25 words:",
    "   (1) What happened: how the fund did this week, and how it has done since January.",
    "   (2) How it compares: did it do better, worse or about the same as the market (use the name in 'comparedWith') and as similar funds? Use EXACTLY the phrases given in 'monthComparison' (for example 'a little better than'), after words like 'it was' or 'it did': 'withComparedWith' is for the market (if it is null, do not mention the market, only similar funds), 'withSimilarFunds' is for similar funds. Do not judge it yourself and do not add numbers here.",
    "   (3) Why: say whether this week's move came mostly from the whole market or from the fund itself (use 'thisWeekSplit' if it is there). Mention a headline ONLY if it clearly explains the move, with its exact title in quotes. Otherwise say honestly that you do not know what caused it.",
    "2. Use at most TWO numbers in a sentence. Only use numbers from the FACTS, rounded to one decimal place and written like 2.1%. Never calculate new numbers. Never write a minus or plus sign in front of a number: say 'went up 2.1%' or 'fell 2.1%'.",
    "3. Use everyday words: went up, fell, did better than, did worse than, about the same as, the market, similar funds, since January. Say 'about the same' when the gap is small (under 0.15). Do not repeat the long fund name.",
    "4. NEVER use these words: index, indices, benchmark, points, percentage, outperform, underperform, alpha, beta, volatility, NAV, CAGR, AUM, peers, allocation, basis points, expense ratio, momentum, correction, rally, bullish, bearish.",
    "5. Never give investment advice: no buy, sell, switch, redeem, 'you should', or predictions. Describe, do not advise. Keep a calm, kind tone, never alarming.",
    "6. Overall: choose 'verdict' as exactly one of: \"No action needed\", \"One fund worth watching\", \"Consider reviewing your allocation\". Start from 'suggestedVerdict' and keep it unless the facts clearly show otherwise. 'verdictReason' is ONE short sentence in plain words that names the fund(s) that matter (or says all are fine).",
    "7. Return the funds in the same order as the FACTS, each with its schemeCode.",
    "STYLE EXAMPLE (copy the style, never the words or numbers): (1) \"Your large company fund went up [X]% this week, but it is still down [Y]% since January.\" (2) \"That is about the same as the market, and about the same as similar funds.\" (3) \"Almost all of the move came from the market itself, and I do not know of any news that explains it.\"",
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

const JARGON = /\b(alpha|beta|sharpe|volatility|benchmark\w*|outperform\w*|underperform\w*|basis points?|bps|cagr|aum|expense ratio|nav|index(?!\s+fund)|indices|points?|percentage|peers?|allocation|momentum|correction|rally|bullish|bearish)\b/i;
/** Plain-language limits for one sentence. */
export const MAX_WORDS = 30; // asked for 25; a little slack so a slightly longer sentence does not trigger a retry
export const MAX_NUMBERS = 2;

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

  // The "market or fund?" split is the signature feature: when we computed one, sentence 3 must say where the move came from.
  for (const f of a_funds(a)) {
    const src = input.funds.find((x) => x.schemeCode === f?.schemeCode);
    const third = Array.isArray(f?.sentences) ? f.sentences[2] : undefined;
    if (src?.comparison.split && typeof third === "string" && !/market/i.test(third)) {
      problems.push(`Fund ${f.schemeCode}, sentence 3: must say whether this week's move came from the whole market or from the fund itself.`);
    }
  }

  // Names such as "Nifty 50" or "Bandhan Nifty 50 Index Fund" contain digits and words that are not Meera's problem.
  const names = [
    ...input.funds.flatMap((f) => [f.name, f.comparison.benchmarkName ?? ""]),
    ...input.marketContext.indexMoves.map((m) => m.name),
  ].filter((n) => n.length > 2).sort((x, y) => y.length - x.length);
  const stripNames = (t: string) => names.reduce((acc, n) => acc.split(n).join(" "), t);

  for (const { where, text } of texts) {
    const plain = stripQuotes(text);
    const plainNoNames = stripNames(plain);
    if (JARGON.test(plainNoNames)) problems.push(`${where}: uses a word that is not plain language ("${JARGON.exec(plainNoNames)![0]}"). Use everyday words.`);
    const wordCount = plain.trim().split(/\s+/).length;
    if (wordCount > MAX_WORDS) problems.push(`${where}: too long (${wordCount} words). Keep each sentence under 25 words.`);
    if (numberTokens(plainNoNames).length > MAX_NUMBERS) problems.push(`${where}: too many numbers. Use at most ${MAX_NUMBERS} numbers in a sentence and explain the rest in words.`);
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

/** The funds array of an answer, or an empty list (keeps the checks above simple). */
function a_funds(a: Partial<GeminiAnswer>): NonNullable<GeminiAnswer["funds"]> {
  return Array.isArray(a.funds) ? a.funds : [];
}
