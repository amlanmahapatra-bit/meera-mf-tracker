/**
 * The Saturday email: subject, HTML and plain text, built from the stored report. Pure code (no network).
 * HTML uses simple tables and inline styles so it looks right in Gmail, Outlook and phone mail apps.
 * Every piece of text from the report is escaped before it goes into the HTML.
 */
import { VERDICTS } from "./config";
import { fmtDate, fmtNav, fmtPct } from "./format";
import { shortName } from "./present";
import type { FundReport, ReportJson } from "./report-types";
import { slotRank } from "./funds";
import { peerStanding } from "./status";

export type BuiltEmail = { subject: string; html: string; text: string };

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const COLORS = {
  ink: "#0f2740", ink2: "#44596f", ink3: "#5c7389", line: "#d5e3f0", page: "#f1f7fc", card: "#ffffff",
  accent: "#2a78d6", accentSoft: "#e4effb", good: "#006300", bad: "#b3261e",
};
const VERDICT_STYLE: Record<string, { bg: string; fg: string }> = {
  [VERDICTS.none]: { bg: "#e1f3e4", fg: "#006300" },
  [VERDICTS.watch]: { bg: "#fdf1d3", fg: "#8a5a00" },
  [VERDICTS.review]: { bg: "#fbe7e4", fg: "#b3261e" },
};
const STATUS_WORD: Record<string, string> = { green: "On track", amber: "Worth watching", red: "Needs a look", unknown: "Not enough data" };

const num = (n: number | null) => (n === null ? "&mdash;" : esc(fmtPct(n)));
const numColor = (n: number | null) => (n === null || Math.abs(n) < 0.05 ? COLORS.ink2 : n > 0 ? COLORS.good : COLORS.bad);

function fundHtml(f: FundReport): string {
  const c = f.comparison;
  const ahead = peerStanding(c.gapVsCategory.month, c.peersUsed) === "ahead";
  const lines = f.sentences.map((s) => `<p style="margin:0 0 8px 0;font-size:16px;line-height:1.5;color:${COLORS.ink};">${esc(s)}</p>`).join("");
  const cell = (label: string, v: number | null) =>
    `<td style="padding:0 16px 0 0;font-size:13px;color:${COLORS.ink3};">${label}<br><span style="font-size:16px;font-weight:700;color:${numColor(v)};">${v === null ? "&mdash;" : num(v)}</span></td>`;
  return `
  <tr><td style="padding:0 0 14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:14px;">
      <tr><td style="padding:18px 20px 6px 20px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLORS.ink3};">${esc(f.slot)} &middot; ${esc(STATUS_WORD[f.status] ?? "")}</div>
        <div style="margin-top:4px;font-size:19px;font-weight:800;color:${COLORS.ink};">${esc(shortName(f.name))}${ahead ? ` <span style="font-size:14px;font-weight:800;color:${COLORS.good};">&#9650; Outperforming</span>` : ""}</div>
      </td></tr>
      <tr><td style="padding:8px 20px 4px 20px;">
        <div style="border-left:4px solid ${COLORS.accent};background:${COLORS.accentSoft};padding:12px 14px;border-radius:8px;">${lines}</div>
      </td></tr>
      <tr><td style="padding:10px 20px 18px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:0 20px 0 0;font-size:13px;color:${COLORS.ink3};">Price (NAV), ${esc(fmtDate(f.asOf, false))}<br><span style="font-size:18px;font-weight:800;color:${COLORS.ink};">${esc(fmtNav(f.nav))}</span></td>
          ${cell("This week", c.fund.week)}${cell("Last month", c.fund.month)}${cell("Year so far", c.fund.ytd)}
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`;
}

export function buildEmail(report: ReportJson, opts: { siteUrl?: string; test?: boolean } = {}): BuiltEmail {
  const funds = [...report.funds].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const v = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE[VERDICTS.none];
  const site = opts.siteUrl?.replace(/\/+$/, "");
  const subject = `${opts.test ? "[Test] " : ""}Your Saturday money check-up: ${report.verdict}`;
  const writtenBy = report.writer.kind === "gemini" ? "Words written by Google Gemini and checked against the numbers." : "Words written by our built-in template (the AI writer was not available this time).";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(report.verdictReason)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
    <tr><td style="padding:0 4px 14px 4px;">
      <div style="font-size:17px;font-weight:800;color:${COLORS.ink};">Meera&#39;s Money Check</div>
      <div style="font-size:13px;color:${COLORS.ink3};">Week ending ${esc(fmtDate(report.weekEnding))}${opts.test ? " &middot; this is a test email" : ""}</div>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <div style="background:${v.bg};border-radius:14px;padding:20px;">
        <div style="font-size:24px;font-weight:800;color:${COLORS.ink};">${esc(report.verdict)}</div>
        <div style="margin-top:8px;font-size:16px;line-height:1.5;color:${COLORS.ink2};">${esc(report.verdictReason)}</div>
      </div>
    </td></tr>
    ${funds.map(fundHtml).join("")}
    ${site ? `<tr><td align="center" style="padding:6px 0 18px 0;"><a href="${esc(site)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">Open the full check-up</a></td></tr>` : ""}
    <tr><td style="padding:4px 4px 0 4px;font-size:12px;line-height:1.5;color:${COLORS.ink3};">
      ${esc(writtenBy)} This is information to help you understand your funds, not investment advice.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    `Meera's Money Check${opts.test ? " (test email)" : ""}`,
    `Week ending ${fmtDate(report.weekEnding)}`,
    "",
    report.verdict.toUpperCase(),
    report.verdictReason,
    "",
    ...funds.flatMap((f) => [
      `${f.slot.toUpperCase()}: ${shortName(f.name)}${peerStanding(f.comparison.gapVsCategory.month, f.comparison.peersUsed) === "ahead" ? "  (Outperforming)" : ""}`,
      ...f.sentences.map((s, i) => `  ${i + 1}. ${s}`),
      `  Price (NAV) ${fmtNav(f.nav)} as of ${fmtDate(f.asOf, false)} | This week ${fmtPct(f.comparison.fund.week)} | Last month ${fmtPct(f.comparison.fund.month)} | Year so far ${fmtPct(f.comparison.fund.ytd)}`,
      "",
    ]),
    ...(site ? [`Open the full check-up: ${site}`, ""] : []),
    writtenBy,
    "This is information to help you understand your funds, not investment advice.",
  ].join("\n");

  return { subject, html, text };
}
