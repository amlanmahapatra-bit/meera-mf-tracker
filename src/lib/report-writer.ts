import { VERDICTS, type Verdict } from "./config";
import { generateReportText } from "./gemini";
import { templateDetail, templateDrivers, templateOverview, templateSentences } from "./report-template";
import type { MarketDriver, ReportInput, ReportJson, ReportLanguage } from "./report-types";

export type WrittenReport = {
  /** Three sentences per fund, keyed by scheme code. */
  sentences: Record<number, [string, string, string]>;
  /** The longer story of the week per fund. */
  detail: Record<number, string[]>;
  /** How the markets did, and the real headlines that explain it. */
  overview: string[];
  drivers: MarketDriver[];
  verdict: Verdict;
  verdictReason: string;
  writer: ReportJson["writer"];
};

const SEVERITY: Record<Verdict, number> = { [VERDICTS.none]: 0, [VERDICTS.watch]: 1, [VERDICTS.review]: 2 };

/** The words of the report: Gemini first (validated, one retry), the built-in template if that fails. */
export async function writeReport(input: ReportInput, language: ReportLanguage = "en"): Promise<WrittenReport> {
  const outcome = await generateReportText(input, language);

  if (outcome.ok) {
    const sentences: Record<number, [string, string, string]> = {};
    const detail: Record<number, string[]> = {};
    for (const f of outcome.answer.funds) { sentences[f.schemeCode] = f.sentences; detail[f.schemeCode] = f.detail; }
    // Each driver is tied to its real article (title already validated), so the screen can link to it.
    const heads = input.marketContext.news.headlines;
    const drivers: MarketDriver[] = outcome.answer.market.drivers.flatMap((d) => {
      const h = heads.find((x) => x.title.toLowerCase().replace(/\s+/g, " ").trim() === d.headline.toLowerCase().replace(/\s+/g, " ").trim());
      return h ? [{ text: d.text, headline: h.title, source: h.source, url: h.url }] : [];
    });

    // The verdict is computed in code first. Gemini may finalise it, but never makes it calmer than the
    // numbers justify when a fund is red, and any change is recorded openly.
    let verdict = outcome.answer.verdict;
    let reason = outcome.answer.verdictReason;
    let note = `Written by ${outcome.model} via OpenRouter${outcome.attempts > 1 ? " on the second attempt" : ""} (about $${(outcome.usage.upstreamCostUsd || outcome.usage.billedCredits).toFixed(4)}).`;
    const anyRed = input.funds.some((f) => f.status === "red");
    if (anyRed && SEVERITY[verdict] < SEVERITY[input.verdict]) {
      verdict = input.verdict;
      reason = input.verdictReason;
      note += " The calculated verdict was kept because a fund is red.";
    } else if (verdict !== input.verdict) {
      note += ` Gemini changed the suggested verdict from "${input.verdict}" to "${verdict}".`;
    }
    return { sentences, detail, overview: outcome.answer.market.overview, drivers, verdict, verdictReason: reason, writer: { kind: "gemini", model: outcome.model, reason: note } };
  }

  const sentences: Record<number, [string, string, string]> = {};
  const detail: Record<number, string[]> = {};
  for (const f of input.funds) { sentences[f.schemeCode] = templateSentences(f, input); detail[f.schemeCode] = templateDetail(f, input); }
  return {
    sentences, detail, overview: templateOverview(input), drivers: templateDrivers(input),
    verdict: input.verdict,
    verdictReason: input.verdictReason,
    writer: { kind: "template", model: null, reason: `Gemini could not be used (${outcome.reason}), so the built-in template wrote the text from the same numbers.` },
  };
}
