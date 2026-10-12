/**
 * Plain-language report written from the numbers alone (no AI), in the same very simple style Gemini is asked for:
 * short sentences, everyday words, few numbers. Used when Gemini is down or its answer fails the checks,
 * so Meera always gets a readable report.
 */
import type { FundComparison, Split } from "./comparison";
import type { FundReport, ReportInput } from "./report-types";

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

function sentence1(f: Omit<FundReport, "sentences">): string {
  const c = f.comparison.fund;
  const week = c.week === null ? "could not be measured this week" : Math.abs(c.week) < 0.05 ? "stayed flat this week" : `${c.week > 0 ? "went up" : "fell"} ${abs1(c.week)}% this week`;
  const ytd = c.ytd === null ? "" : `, and is ${c.ytd >= 0 ? "up" : "down"} ${abs1(c.ytd)}% since January`;
  return `Your ${f.slot} fund ${week}${ytd}.`;
}

function sentence2(f: Omit<FundReport, "sentences">): string {
  const c: FundComparison = f.comparison;
  const simWords = gapWords(c.gapVsCategory.month);
  const similar = simWords && c.peersUsed > 0 ? `${simWords} ${c.peersUsed === 1 ? "a similar fund" : `the ${c.peersUsed} similar funds`}` : null;
  if (c.reference === "benchmark" && c.gapVsBenchmark) {
    const idxWords = gapWords(c.gapVsBenchmark.month);
    if (idxWords) {
      const tail = similar ? `, and ${similar}` : "";
      return `Over the last month it did ${idxWords} ${f.referenceLabel}${tail}.`;
    }
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

function sentence3(f: Omit<FundReport, "sentences">): string {
  const split = f.comparison.split;
  return split ? `${splitWords(split)}, and I do not know of any news that explains it.` : "It is hard to link this week's move to one news story, so I do not know what caused it.";
}

export function templateSentences(f: Omit<FundReport, "sentences">, _input: ReportInput): [string, string, string] {
  void _input;
  return [sentence1(f), sentence2(f), sentence3(f)];
}
