import { describe, expect, it } from "vitest";
import { VERDICTS } from "./config";
import { buildReportPdf, pdfSafe } from "./report-pdf";
import type { ReportJson } from "./report-types";

const fund = (code: number, slot: string): ReportJson["funds"][number] => ({
  schemeCode: code, name: `Test Fund ${code} - Direct Plan - Growth`, slot, status: "green", weeksLagging: 0, nav: 31.5275, asOf: "2026-10-09", referenceLabel: "the Nifty 50", dataNotes: [],
  sentences: ["Line one ₹5.", "Line two.", "Line three “quoted”."], detail: Array(6).fill("A longer sentence about the week that keeps the page filling up nicely."),
  comparison: { fund: { week: 2.28, month: 6.33, ytd: 29.74 }, gapVsCategory: { week: 0, month: 1.6, ytd: 0 }, peersUsed: 3, peersRequested: 3, benchmarkName: "Nifty 50" } as never,
});
const report = {
  weekEnding: "2026-10-10", generatedAt: "", language: "en", verdict: VERDICTS.none, verdictReason: "All fine.",
  funds: Array.from({ length: 12 }, (_, i) => fund(100 + i, "Large Cap")),
  marketContext: { indexMoves: [{ name: "Nifty 50", week: 0.4, month: null, ytd: null, asOf: null }], overview: ["Calm week."], drivers: [{ text: "Oil eased.", headline: "Oil falls", source: "Reuters", url: "https://example.com/a" }], news: { source: "gnews", note: "", headlines: [{ title: "Oil falls", source: "Reuters", publishedAt: null, url: "https://example.com/a" }] }, notices: ["A note."] },
  writer: { kind: "gemini", model: "x", reason: null },
} as unknown as ReportJson;

describe("buildReportPdf", () => {
  it("makes a real multi-page PDF even with characters Helvetica cannot draw", async () => {
    const bytes = await buildReportPdf(report);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
  });
  it("pdfSafe swaps unsupported characters", () => {
    expect(pdfSafe("₹5 “hi” – ok ↗ 日本")).toBe('Rs 5 "hi" - ok  ');
  });
});
