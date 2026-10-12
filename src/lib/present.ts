/** Turns computed gaps into the plain phrases shown on screen. Pure and tested. */
import type { FundComparison } from "./comparison";

/** "Bandhan Nifty 50 Index Fund - Direct Plan - Growth" -> "Bandhan Nifty 50 Index Fund". */
export function shortName(name: string): string {
  return name
    .replace(/\s*[-–]\s*Direct Plan.*$/i, "")
    .replace(/\s*[-–]\s*(Growth|Direct).*$/i, "")
    .replace(/\s+Direct\s+Growth.*$/i, "")
    .replace(/\s+\(Growth\)$/i, "")
    .trim();
}

export type GapTone = "good" | "bad" | "flat" | "na";
export type GapPhrase = { text: string; tone: GapTone };

/** A gap between two returns in everyday words: "About the same", "1.6% better", "0.9% worse". */
export function gapPhrase(gap: number | null | undefined): GapPhrase {
  if (gap === null || gap === undefined || !Number.isFinite(gap)) return { text: "Not available", tone: "na" };
  if (Math.abs(gap) < 0.15) return { text: "About the same", tone: "flat" };
  const n = Math.abs(gap).toFixed(1);
  return gap > 0 ? { text: `${n}% better`, tone: "good" } : { text: `${n}% worse`, tone: "bad" };
}

export type ComparisonRow = { key: string; label: string; phrase: GapPhrase; help?: "index" | "similar" };

/** The "compared with" lines for a fund: its market index (if any) and the average of similar funds, over the last month. */
export function comparisonRows(c: FundComparison): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  if (c.benchmarkName) {
    rows.push({ key: "index", label: `the ${c.benchmarkName}`, phrase: c.gapVsBenchmark ? gapPhrase(c.gapVsBenchmark.month) : gapPhrase(null), help: "index" });
  }
  if (c.peersRequested > 0) {
    rows.push({
      key: "similar",
      label: c.peersUsed > 0 ? `the average of ${c.peersUsed} similar fund${c.peersUsed === 1 ? "" : "s"}` : "similar funds",
      phrase: gapPhrase(c.gapVsCategory.month),
      help: "similar",
    });
  }
  return rows;
}
