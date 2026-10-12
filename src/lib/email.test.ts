import { describe, expect, it } from "vitest";
import { VERDICTS } from "./config";
import { buildEmail, esc } from "./email";
import type { ReportJson } from "./report-types";

const fund = (code: number, slot: string, name: string, sentences: [string, string, string], catGap: number, peers = 5) => ({
  schemeCode: code, name, slot, status: "green" as const, weeksLagging: 0, nav: 31.5275, asOf: "2026-10-09", referenceLabel: "the Nasdaq 100", dataNotes: [], sentences,
  comparison: { fund: { week: 2.28, month: 6.33, ytd: 29.74 }, gapVsCategory: { week: 0, month: catGap, ytd: 0 }, peersUsed: peers, peersRequested: peers, benchmarkName: "Nasdaq 100" } as never,
});
const report = {
  weekEnding: "2026-10-10", generatedAt: "", language: "en", verdict: VERDICTS.none, verdictReason: "All your funds are doing fine.",
  funds: [
    fund(150751, "International", "Axis NASDAQ 100 US Specific Equity Passive FOF - Direct Plan - Growth Option", ["Line one.", "Line two.", "Line three."], 1.6),
    fund(118482, "Large Cap", "Bandhan Nifty 50 Index Fund - Direct Plan - Growth", ["<script>alert(1)</script> & \"quotes\"", "Two.", "Three."], 0.0),
  ],
  marketContext: { indexMoves: [], news: { source: "gnews", note: "", headlines: [] }, notices: [] },
  writer: { kind: "gemini", model: "google/gemini-3.7-flash", reason: null },
} as unknown as ReportJson;

describe("buildEmail", () => {
  const m = buildEmail(report, { siteUrl: "https://example.com/" });

  it("has a clear subject with the verdict", () => {
    expect(m.subject).toBe("Your Saturday money report: No action needed");
  });
  it("shows each fund's three plain lines, price and returns, in dashboard order", () => {
    expect(m.html).toContain("Line one.");
    expect(m.html).toContain("Line three.");
    expect(m.html).toContain("₹31.5275");
    expect(m.html).toContain("+2.3%");
    expect(m.html.indexOf("Bandhan Nifty 50 Index Fund")).toBeLessThan(m.html.indexOf("Axis NASDAQ 100")); // Large Cap before International
  });
  it("escapes everything from the report, so nothing can inject HTML", () => {
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;");
  });
  it("marks only the fund that beat similar funds as Outperforming", () => {
    expect(m.html.match(/Outperforming/g)).toHaveLength(1);
    expect(m.text).toContain("Axis NASDAQ 100 US Specific Equity Passive FOF  (Outperforming)");
    expect(m.text).not.toContain("Bandhan Nifty 50 Index Fund  (Outperforming)");
  });
  it("includes the button to the site only when a site address is set, without a double slash", () => {
    expect(m.html).toContain('href="https://example.com/report"');
    expect(buildEmail(report).html).not.toContain("Open the full report online");
  });
  it("has a plain-text version with the same content", () => {
    expect(m.text).toContain("NO ACTION NEEDED");
    expect(m.text).toContain("  1. Line one.");
    expect(m.text).toContain("Open the full report online: https://example.com/report");
  });
  it("says honestly when the template wrote the words", () => {
    const t = buildEmail({ ...report, writer: { kind: "template", model: null, reason: "x" } } as ReportJson);
    expect(t.html).toContain("built-in template");
    expect(m.html).toContain("Google Gemini");
  });
  it("labels a test email", () => {
    const t = buildEmail(report, { test: true });
    expect(t.subject.startsWith("[Test] ")).toBe(true);
    expect(t.html).toContain("this is a test email");
  });
  it("is a detailed report: glance table, market reasons with links, the longer story and longer-term returns", () => {
    const rich = {
      ...report,
      funds: report.funds.map((f) => ({ ...f, detail: ["First long line.", "Second long line.", "Third.", "Fourth."], periods: [{ key: "1y", label: "1 year", pct: 12.3, perYear: null, baseDate: null }] })),
      marketContext: {
        ...report.marketContext,
        indexMoves: [{ name: "Nifty 50", week: 0.4, month: null, ytd: null, asOf: null }],
        overview: ["Markets rose a little."],
        drivers: [{ text: "Oil prices eased.", headline: "Oil falls <b>fast</b>", source: "Reuters", url: "https://example.com/a?x=1&y=2" }, { text: "Bad link.", headline: "Odd", source: "X", url: "javascript:alert(1)" }],
        news: { source: "gnews", note: "", headlines: [{ title: "Oil falls fast", source: "Reuters", publishedAt: null, url: "https://example.com/a" }] },
      },
    } as unknown as ReportJson;
    const r = buildEmail(rich, { siteUrl: "https://example.com" });
    for (const t of ["The week at a glance", "How the markets did, and why", "Each fund, in detail", "First long line.", "Markets rose a little.", "Everything we read this week", "12.3%"]) expect(r.html).toContain(t);
    expect(r.html).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(r.html).not.toContain("javascript:");
    expect(r.html).not.toContain("<b>fast");
    expect(r.text).toContain("Oil falls <b>fast</b> (Reuters) https://example.com/a?x=1&y=2");
    expect(r.html.length).toBeGreaterThan(m.html.length);
  });
  it("esc handles the dangerous characters", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
