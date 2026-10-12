/**
 * Plain-language report written from the numbers alone (no AI).
 * Used when Gemini is down or its answer fails validation, so Meera always gets a readable report.
 */
import type { FundComparison, WindowValues } from "./comparison";
import type { FundReport, ReportInput } from "./report-types";

const abs1 = (n: number) => Math.abs(n).toFixed(1);

function move(n: number | null): string {
  if (n === null) return "could not be measured";
  if (Math.abs(n) < 0.05) return "was flat";
  return `${n > 0 ? "rose" : "fell"} ${abs1(n)}%`;
}

/** "about the same as X", "1.2 points ahead of X" or "0.8 points behind X". */
export function describeGap(gap: number | null, label: string): string {
  if (gap === null) return `could not be compared with ${label}`;
  if (Math.abs(gap) < 0.15) return `is about the same as ${label}`;
  const p = abs1(gap);
  return `is ${p} point${p === "1.0" ? "" : "s"} ${gap > 0 ? "ahead of" : "behind"} ${label}`;
}

function sentence1(f: Omit<FundReport, "sentences">): string {
  const c = f.comparison.fund;
  const parts = [`${move(c.week)} this week`];
  if (c.month !== null) parts.push(`${move(c.month)} over the last month`);
  if (c.ytd !== null) parts.push(`is ${c.ytd >= 0 ? "up" : "down"} ${abs1(c.ytd)}% since January`);
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Your ${f.slot} fund ${joined}.`;
}

function sentence2(f: Omit<FundReport, "sentences">): string {
  const c: FundComparison = f.comparison;
  if (c.reference === "benchmark" && c.gapVsBenchmark) {
    const catPart = c.category.month !== null ? ` and ${describeGap(c.gapVsCategory.month, `the average of ${c.peersUsed} similar fund${c.peersUsed === 1 ? "" : "s"}`)}` : "";
    return `Over the last month it ${describeGap(c.gapVsBenchmark.month, f.referenceLabel)}${catPart}.`;
  }
  if (c.reference === "category") {
    const why = c.benchmarkMissing ? `${c.benchmarkName ?? "its index"} data was not available this time, so` : "There is no free market index for this kind of fund, so";
    return `${why} it is compared with similar funds only: over the last month it ${describeGap(c.gapVsCategory.month, `the average of ${c.peersUsed} similar fund${c.peersUsed === 1 ? "" : "s"}`)}.`;
  }
  return "There was not enough data to compare it with anything this week.";
}

function sentence3(f: Omit<FundReport, "sentences">, input: ReportInput): string {
  const split = f.comparison.split;
  const head = input.marketContext.news.headlines[0];
  const word = split && split.total >= 0 ? "gain" : "drop";
  const splitText = !split
    ? ""
    : Math.abs(split.fundPart) < 0.05
      ? `Essentially all of this week's ${word} of ${abs1(split.total)}% came from the market as a whole, not from the fund itself. `
      : `Of this week's ${word} of ${abs1(split.total)}%, ${abs1(split.marketPart)}% was the whole market and ${abs1(split.fundPart)}% was ${split.fundPart >= 0 ? "extra from" : "down to"} this fund. `;
  const news = head
    ? `One headline this week: "${head.title}" (${head.source}), though I can't say it explains this fund's move.`
    : "I don't know of a news event that explains this move.";
  return splitText + news;
}

export function templateSentences(f: Omit<FundReport, "sentences">, input: ReportInput): [string, string, string] {
  return [sentence1(f), sentence2(f), sentence3(f, input)];
}

export type { WindowValues };
