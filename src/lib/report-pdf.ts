/**
 * The weekly report as a PDF (attached to the Saturday email). Pure JavaScript (pdf-lib), so it runs on Vercel
 * with no browser. Uses the built-in Helvetica fonts, so text is first made safe for them (e.g. the rupee
 * sign becomes "Rs"). No network.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fmtDate, fmtPct } from "./format";
import { slotRank } from "./funds";
import { shortName } from "./present";
import type { FundReport, ReportJson } from "./report-types";
import { peerStanding } from "./status";

/** Helvetica (WinAnsi) cannot draw every character; swap the ones we meet for plain look-alikes. */
export function pdfSafe(s: string): string {
  return s
    .replace(/₹/g, "Rs ")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-").replace(/…/g, "...")
    .replace(/[↑▲]/g, "^").replace(/↗/g, "")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

const INK = rgb(0.06, 0.15, 0.25), INK2 = rgb(0.27, 0.35, 0.44), INK3 = rgb(0.36, 0.45, 0.54);
const LINE = rgb(0.84, 0.89, 0.94), SOFT = rgb(0.89, 0.94, 0.98), ACCENT = rgb(0.16, 0.47, 0.84);
const GOOD = rgb(0, 0.39, 0), BAD = rgb(0.7, 0.15, 0.12);
const STATUS_WORD: Record<string, string> = { green: "On track", amber: "Worth watching", red: "Needs a look", unknown: "Not enough data" };
const SOURCE_LABEL: Record<string, string> = { gnews: "GNews", google_news_rss: "Google News (backup source)", none: "no news source" };
const LONG_TERM = ["6m", "1y", "3y", "5y"] as const;

const W = 595.28, H = 841.89, M = 44;

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, public reg: PDFFont, public bold: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.y = H - M;
  }
  need(h: number) {
    if (this.y - h < M) this.newPage();
  }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    let cur = "";
    for (const word of pdfSafe(text).split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && cur) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  /** One line cut with "..." so it never runs off the page (used for web addresses, which have no spaces to wrap at). */
  fit(text: string, size: number): string {
    let t = pdfSafe(text);
    const max = W - 2 * M;
    if (this.reg.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 10 && this.reg.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
    return `${t}...`;
  }
  /** Wrapped paragraph; returns nothing, moves the cursor down. */
  para(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10.5, font = o.bold ? this.bold : this.reg, indent = o.indent ?? 0, lead = size * 1.45;
    for (const l of this.wrap(text, font, size, W - 2 * M - indent)) {
      this.need(lead);
      this.y -= lead;
      this.page.drawText(l, { x: M + indent, y: this.y, size, font, color: o.color ?? INK2 });
    }
    this.y -= o.gap ?? 5;
  }
  heading(text: string) {
    this.need(120); // never leave a heading alone at the bottom of a page
    this.y -= 12;
    this.para(text, { size: 14, bold: true, color: INK, gap: 4 });
  }
  rule() {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 6;
  }
}

const numColor = (n: number | null | undefined) => (n == null || Math.abs(n) < 0.05 ? INK2 : n > 0 ? GOOD : BAD);

function glance(w: Writer, funds: FundReport[]) {
  const cols = [M, W - M - 190, W - M - 125, W - M - 60]; // name, week, month, year (right edges for numbers)
  w.need(30);
  w.y -= 14;
  ["FUND", "WEEK", "MONTH", "YEAR SO FAR"].forEach((t, i) => {
    const x = i === 0 ? M : cols[i] + 55 - w.bold.widthOfTextAtSize(t, 7.5);
    w.page.drawText(t, { x, y: w.y, size: 7.5, font: w.bold, color: INK3 });
  });
  w.y -= 6;
  w.rule();
  for (const f of funds) {
    w.need(30);
    w.y -= 13;
    w.page.drawText(pdfSafe(shortName(f.name)), { x: M, y: w.y, size: 10.5, font: w.bold, color: INK });
    [f.comparison.fund.week, f.comparison.fund.month, f.comparison.fund.ytd].forEach((v, i) => {
      const t = pdfSafe(fmtPct(v));
      w.page.drawText(t, { x: cols[i + 1] + 55 - w.bold.widthOfTextAtSize(t, 10.5), y: w.y, size: 10.5, font: w.bold, color: numColor(v) });
    });
    w.y -= 11;
    w.page.drawText(pdfSafe(`${f.slot} - ${STATUS_WORD[f.status] ?? ""}`), { x: M, y: w.y, size: 8.5, font: w.reg, color: INK3 });
    w.y -= 5;
    w.rule();
  }
}

export async function buildReportPdf(report: ReportJson): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Trackerr weekly report, week ending ${report.weekEnding}`);
  doc.setAuthor("Trackerr");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const funds = [...report.funds].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const m = report.marketContext;

  w.para("Trackerr - Weekly report", { size: 20, bold: true, color: INK, gap: 2 });
  w.para(`Week ending ${fmtDate(report.weekEnding)}`, { size: 10, color: INK3, gap: 10 });

  // Verdict box
  const reasonLines = w.wrap(report.verdictReason, w.reg, 11, W - 2 * M - 24).length;
  const boxH = 30 + reasonLines * 16 + 12;
  w.need(boxH + 6);
  w.page.drawRectangle({ x: M, y: w.y - boxH, width: W - 2 * M, height: boxH, color: SOFT });
  w.page.drawText(pdfSafe(report.verdict), { x: M + 12, y: w.y - 24, size: 15, font: w.bold, color: INK });
  w.y -= 30;
  w.para(report.verdictReason, { size: 11, indent: 12, gap: 0 });
  w.y -= 16;

  w.heading("The week at a glance");
  glance(w, funds);

  w.heading("How the markets did, and why");
  const moves = m.indexMoves.filter((x) => x.week !== null).map((x) => `${x.name} ${fmtPct(x.week)}`).join("   |   ");
  if (moves) w.para(moves, { bold: true, color: INK, gap: 6 });
  if ((m.overview ?? []).length) w.para(m.overview!.join(" "), { gap: 8 });
  for (const d of m.drivers ?? []) {
    w.para(d.text, { gap: 1 });
    w.para(`${d.headline} (${d.source})`, { size: 9.5, bold: true, color: ACCENT, gap: 1 });
    if (d.url) w.para(w.fit(d.url, 7.5), { size: 7.5, color: INK3, gap: 7 });
  }

  w.heading("Each fund, in detail");
  for (const f of funds) {
    const c = f.comparison;
    w.need(110);
    w.y -= 6;
    w.para(f.slot.toUpperCase(), { size: 8, bold: true, color: INK3, gap: 0 });
    const ahead = peerStanding(c.gapVsCategory.month, c.peersUsed) === "ahead";
    w.para(`${shortName(f.name)}${ahead ? "   ^ Outperforming" : ""}`, { size: 13, bold: true, color: ahead ? GOOD : INK, gap: 1 });
    w.para(`${STATUS_WORD[f.status] ?? ""}  |  Price (NAV) ${pdfSafe(`₹${f.nav.toFixed(4)}`)} as of ${fmtDate(f.asOf, false)}`, { size: 9, color: INK3, gap: 5 });
    f.sentences.forEach((s, i) => w.para(`${i + 1}. ${s}`, { color: INK, indent: 8, gap: 2 }));
    w.y -= 4;
    if (f.detail?.length) w.para(f.detail.join(" "), { gap: 5 });
    w.para(`This week ${fmtPct(c.fund.week)}   |   Last month ${fmtPct(c.fund.month)}   |   Year so far ${fmtPct(c.fund.ytd)}`, { size: 9.5, bold: true, color: INK, gap: 1 });
    const long = LONG_TERM.flatMap((k) => {
      const p = f.periods?.find((x) => x.key === k);
      return p && p.pct !== null ? [`${p.label} ${fmtPct(p.pct)}${p.perYear !== null ? ` (${fmtPct(p.perYear)} a year)` : ""}`] : [];
    });
    if (long.length) w.para(long.join("   |   "), { size: 9, color: INK3, gap: 4 });
    w.rule();
  }

  if (m.news.headlines.length) {
    w.heading("Everything we read this week");
    w.para(`Source: ${SOURCE_LABEL[m.news.source] ?? ""}`, { size: 9, color: INK3, gap: 4 });
    for (const h of m.news.headlines) w.para(`${h.title} (${h.source})`, { size: 9.5, color: INK, gap: 2 });
  }

  w.y -= 8;
  for (const n of m.notices) w.para(n, { size: 8, color: INK3, gap: 2 });
  w.para(`${report.writer.kind === "gemini" ? "Words written by Google Gemini and checked against the numbers." : "Words written by our built-in template (the AI writer was not available this time)."} All figures are worked out by code from public price data. This is information to help you understand your funds, not investment advice.`, { size: 8, color: INK3 });

  return doc.save();
}
