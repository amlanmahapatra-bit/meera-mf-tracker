import { templateSentences } from "./report-template";
import type { FundReport, ReportInput, ReportJson } from "./report-types";

export type WrittenReport = {
  /** Three sentences per fund, keyed by scheme code. */
  sentences: Record<number, [string, string, string]>;
  writer: ReportJson["writer"];
};

/** Template-only writer (Gemini is added on top of this in the next step). */
export async function writeReport(input: ReportInput): Promise<WrittenReport> {
  const sentences: Record<number, [string, string, string]> = {};
  for (const f of input.funds) sentences[f.schemeCode] = templateSentences(f, input);
  return { sentences, writer: { kind: "template", model: null, reason: "Written from the numbers by the built-in template." } };
}

export type { FundReport };
