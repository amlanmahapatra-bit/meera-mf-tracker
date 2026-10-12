import { describe, expect, it } from "vitest";
import { VERDICTS } from "./config";
import { buildShareCsv, buildShareText, csvDataUri, mailtoLink, shareSubject, whatsappLink } from "./share";
import type { ReportJson } from "./report-types";

const fund = (code: number, name: string, nav: number, w: number | null, m: number | null, y: number | null) => ({
  schemeCode: code, name, slot: "Large Cap", status: "green" as const, weeksLagging: 0, nav, asOf: "2026-10-09",
  comparison: { fund: { week: w, month: m, ytd: y } } as never, referenceLabel: "x", sentences: ["a.", "b.", "c."] as [string, string, string], dataNotes: [],
});
const report = {
  weekEnding: "2026-10-10", generatedAt: "", language: "en", verdict: VERDICTS.none, verdictReason: "All good.",
  funds: [fund(118482, "Bandhan Nifty 50 Index Fund - Direct Plan - Growth", 50.461, 0.44, -3.9, -13.1), fund(1, 'Fund, "Quoted"', 10, null, 1, 2)],
  marketContext: { indexMoves: [], news: { source: "gnews", note: "", headlines: [] }, notices: [] },
  writer: { kind: "gemini", model: "m", reason: null },
} as unknown as ReportJson;

describe("buildShareText", () => {
  const t = buildShareText(report);
  it("lists every fund with scheme code, NAV, date and returns", () => {
    expect(t).toContain("1) Bandhan Nifty 50 Index Fund - Direct Plan - Growth");
    expect(t).toContain("Scheme code: 118482");
    expect(t).toContain("NAV: ₹50.461 (as of 9 Oct 2026)");
    expect(t).toContain("Week +0.4% | Month −3.9% | Year so far −13.1%");
    expect(t).toContain("2) Fund");
  });
  it("shows a dash for a missing number instead of inventing one", () => {
    expect(t).toContain("Week — | Month +1.0%");
  });
  it("includes the overall verdict, the week and the sender line", () => {
    expect(t).toContain("week ending 10 Oct 2026");
    expect(t).toContain("Overall: No action needed. All good.");
    expect(t).toContain("Sent from Trackerr");
  });
});

describe("links", () => {
  it("builds a WhatsApp link with the message fully encoded", () => {
    const l = whatsappLink("Hi & bye\nline 2");
    expect(l.startsWith("https://wa.me/?text=")).toBe(true);
    expect(l).toContain("Hi%20%26%20bye%0Aline%202");
  });
  it("builds an email link", () => {
    const l = mailtoLink(shareSubject(report), "body text");
    expect(l.startsWith("mailto:?subject=")).toBe(true);
    expect(l).toContain("week%20ending%2010%20Oct%202026");
    expect(l).toContain("&body=body%20text");
  });
});

describe("CSV", () => {
  const csv = buildShareCsv(report);
  it("has a header and one row per fund", () => {
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Fund,Scheme code,NAV,NAV date,Week %,Month %,Year so far %");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("Bandhan Nifty 50 Index Fund - Direct Plan - Growth,118482,50.461,2026-10-09,0.44,-3.9,-13.1");
  });
  it("quotes commas and quotes, and leaves missing numbers empty", () => {
    expect(csv.split("\r\n")[2]).toBe('"Fund, ""Quoted""",1,10,2026-10-09,,1,2');
  });
  it("makes a downloadable data link", () => {
    expect(csvDataUri("a,b")).toBe("data:text/csv;charset=utf-8,a%2Cb");
  });
});
