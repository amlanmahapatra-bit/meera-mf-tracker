/**
 * Plain-language report written from the numbers alone (no AI), in the same very simple style Gemini is asked for:
 * short sentences, everyday words, few numbers. Used when Gemini is down or its answer fails the checks,
 * so Meera always gets a complete, readable report (three lines, the longer story, the market summary).
 */
import type { FundComparison, Split } from "./comparison";
import { fmtPct } from "./format";
import type { FundReport, MarketDriver, ReportInput } from "./report-types";

const abs1 = (n: number) => Math.abs(n).toFixed(1);

/** "about the same as", "a little better than", "much worse than" (never numbers). Meant to follow "it was" / "it did". */
export function gapWords(gap: number | null): string | null {
  if (gap === null) return null;
  const a = Math.abs(gap);
  if (a < 0.15) return "about the same as";
  const dir = gap > 0 ? "better" : "worse";
  if (a < 1) return `a little ${dir} than`;
  if (a < 3) return `${dir} than`;
  return `much ${dir} than`;
}

type F = Omit<FundReport, "sentences" | "detail">;

function sentence1(f: F): string {
  const c = f.comparison.fund;
  const week = c.week === null ? "could not be measured this week" : Math.abs(c.week) < 0.05 ? "stayed flat this week" : `${c.week > 0 ? "went up" : "fell"} ${abs1(c.week)}% this week`;
  const ytd = c.ytd === null ? "" : `, and is ${c.ytd >= 0 ? "up" : "down"} ${abs1(c.ytd)}% since January`;
  return `Your ${f.slot} fund ${week}${ytd}.`;
}

function sentence2(f: F): string {
  const c: FundComparison = f.comparison;
  const simWords = gapWords(c.gapVsCategory.month);
  const similar = simWords && c.peersUsed > 0 ? `${simWords} ${c.peersUsed === 1 ? "a similar fund" : `the ${c.peersUsed} similar funds`}` : null;
  if (c.reference === "benchmark" && c.gapVsBenchmark) {
    const idxWords = gapWords(c.gapVsBenchmark.month);
    if (idxWords) return `Over the last month it did ${idxWords} ${f.referenceLabel}${similar ? `, and ${similar}` : ""}.`;
  }
  if (similar) {
    const why = c.benchmarkMissing ? "The market score was not available this time, so" : "There is no market score for this kind of fund, so";
    return `${why} we compared it with similar funds: over the last month it did ${similar}.`;
  }
  return "There was not enough information to compare it with anything this week.";
}

function splitWords(split: Split): string {
  const m = Math.abs(split.marketPart);
  const f = Math.abs(split.fundPart);
  if (f < 0.05) return "Almost all of the move came from the market itself";
  if (m < 0.05) return "Almost all of the move came from the fund itself";
  return m >= f ? "Most of the move came from the whole market, and the rest from the fund itself" : "Most of the move came from the fund itself, and the rest from the whole market";
}

/** The best-fitting headline for a fund by topic: Indian funds like India/economy news, the US fund likes global news. */
function topicFor(f: F): "india" | "economy" | "global" {
  return /nasdaq|s&p|us /i.test(f.comparison.benchmarkName ?? f.name) || f.slot === "International" ? "global" : f.slot.toLowerCase().includes("debt") ? "economy" : "india";
}

function sentence3(f: F, input: ReportInput): string {
  const split = f.comparison.split;
  const heads = input.marketContext.news.headlines;
  const topic = topicFor(f);
  const pick = heads.find((h) => h.topic === topic) ?? heads[0];
  const marketMoved = split ? Math.abs(split.marketPart) >= 0.3 : false;
  if (split && marketMoved && pick) {
    return `${splitWords(split)}, and the news that fits best is "${pick.title}" (${pick.source}), though we cannot say it caused the move.`;
  }
  if (split) return `${splitWords(split)}, and it was a quiet week in the news.`;
  return "It is hard to link this week's move to one news story, so we cannot say what caused it.";
}

export function templateSentences(f: F, input: ReportInput): [string, string, string] {
  return [sentence1(f), sentence2(f), sentence3(f, input)];
}

/** The longer story of the week for one fund, from the numbers only (4 to 6 short sentences). */
export function templateDetail(f: F, input: ReportInput): string[] {
  const out = [sentence1(f), sentence2(f)];
  const split = f.comparison.split;
  if (split) out.push(`${splitWords(split)}.`);
  const p = f.periods ?? [];
  const year = p.find((x) => x.key === "1y");
  const three = p.find((x) => x.key === "3y");
  if (year?.pct != null) {
    out.push(`Over the last year it ${year.pct >= 0 ? "went up" : "fell"} ${abs1(year.pct)}%${three?.perYear != null ? `, and over three years it has averaged ${abs1(three.perYear)}% a year` : ""}.`);
  }
  const statusLine: Record<string, string> = {
    green: "It is on track and nothing needs attention.",
    amber: `It is worth watching${f.weeksLagging > 0 ? `, because it has trailed what it is compared with for ${f.weeksLagging} week${f.weeksLagging === 1 ? "" : "s"} in a row` : ""}.`,
    red: "It needs a closer look, because it is well behind what it is compared with.",
    unknown: "There is not enough information yet to judge it.",
  };
  out.push(statusLine[f.status] ?? statusLine.unknown);
  out.push(sentence3(f, input));
  return out;
}

/** A plain summary of how the markets did, from the index moves only. */
export function templateOverview(input: ReportInput): string[] {
  const moves = input.marketContext.indexMoves.filter((m) => m.week !== null);
  if (moves.length === 0) return ["The market numbers could not be loaded this week."];
  return moves.slice(0, 4).map((m) => `The ${m.name} ${Math.abs(m.week!) < 0.05 ? "was flat" : `${m.week! > 0 ? "rose" : "fell"} ${abs1(m.week!)}%`} this week${m.name === "Nasdaq 100" ? " (in US dollars)" : ""}.`);
}

/** Headlines of the week as "drivers", using each article's own summary (no claim that it caused anything). */
export function templateDrivers(input: ReportInput): MarketDriver[] {
  return input.marketContext.news.headlines.slice(0, 3).map((h) => ({
    text: h.description ? h.description.split(/(?<=[.!?])\s/)[0].slice(0, 220) : `${h.source} reported on this during the week.`,
    headline: h.title,
    source: h.source,
    url: h.url,
  }));
}

export { fmtPct };
