/**
 * The Saturday email: a detailed report of the whole week (markets, the news behind them, every fund) as HTML and
 * plain text, built from the stored report. Pure code (no network).
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

const SOURCE_LABEL: Record<string, string> = { gnews: "GNews", google_news_rss: "Google News (backup source)", none: "no news source" };
const LONG_TERM = ["6m", "1y", "3y", "5y"] as const;

/** Only real web links go into the email. */
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? esc(u) : "");

const h2 = (t: string) => `<tr><td style="padding:10px 4px 8px 4px;font-size:18px;font-weight:800;color:${COLORS.ink};">${esc(t)}</td></tr>`;
const card = (inner: string) =>
  `<tr><td style="padding:0 0 14px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:14px;"><tr><td style="padding:18px 20px;">${inner}</td></tr></table></td></tr>`;
const para = (t: string, extra = "") => `<p style="margin:0 0 10px 0;font-size:16px;line-height:1.55;color:${COLORS.ink2};${extra}">${esc(t)}</p>`;

function glanceHtml(funds: FundReport[]): string {
  const th = (t: string, right = false) => `<td style="padding:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${COLORS.ink3};${right ? "text-align:right;" : ""}">${t}</td>`;
  const rows = funds
    .map((f) => {
      const c = f.comparison.fund;
      const cellNum = (v: number | null) => `<td style="padding:8px 0;border-top:1px solid ${COLORS.line};text-align:right;font-size:15px;font-weight:700;color:${numColor(v)};">${num(v)}</td>`;
      return `<tr><td style="padding:8px 8px 8px 0;border-top:1px solid ${COLORS.line};font-size:14px;font-weight:700;color:${COLORS.ink};">${esc(shortName(f.name))}<br><span style="font-size:12px;font-weight:400;color:${COLORS.ink3};">${esc(f.slot)} &middot; ${esc(STATUS_WORD[f.status] ?? "")}</span></td>${cellNum(c.week)}${cellNum(c.month)}${cellNum(c.ytd)}</tr>`;
    })
    .join("");
  return card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th("Fund")}${th("Week", true)}${th("Month", true)}${th("Year so far", true)}</tr>${rows}</table>`);
}

function marketHtml(report: ReportJson): string {
  const m = report.marketContext;
  const tiles = m.indexMoves
    .filter((x) => x.week !== null)
    .map((x) => `<td style="padding:0 18px 8px 0;font-size:12px;color:${COLORS.ink3};">${esc(x.name)}<br><span style="font-size:17px;font-weight:800;color:${numColor(x.week)};">${num(x.week)}</span></td>`)
    .join("");
  const overview = (m.overview ?? []).length ? para(m.overview!.join(" ")) : "";
  const drivers = (m.drivers ?? [])
    .map((d) => {
      const url = safeUrl(d.url);
      const link = url
        ? `<a href="${url}" style="color:${COLORS.accent};font-weight:700;text-decoration:none;">${esc(d.headline)}</a>`
        : `<strong style="color:${COLORS.ink};">${esc(d.headline)}</strong>`;
      return `<div style="margin:0 0 12px 0;">${para(d.text, "margin-bottom:2px;")}<div style="font-size:14px;line-height:1.4;">${link} <span style="color:${COLORS.ink3};">&middot; ${esc(d.source)}</span></div></div>`;
    })
    .join("");
  return card(`${tiles ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${tiles}</tr></table>` : ""}${overview}${drivers}`);
}

function fundHtml(f: FundReport): string {
  const c = f.comparison;
  const ahead = peerStanding(c.gapVsCategory.month, c.peersUsed) === "ahead";
  const lines = f.sentences.map((s) => `<p style="margin:0 0 8px 0;font-size:16px;line-height:1.5;color:${COLORS.ink};">${esc(s)}</p>`).join("");
  const cell = (label: string, v: number | null) =>
    `<td style="padding:0 16px 0 0;font-size:13px;color:${COLORS.ink3};">${label}<br><span style="font-size:16px;font-weight:700;color:${numColor(v)};">${num(v)}</span></td>`;
  const long = LONG_TERM.map((k) => f.periods?.find((p) => p.key === k)).filter((p) => p && p.pct !== null);
  const longCells = long
    .map((p) => `<td style="padding:0 16px 0 0;font-size:13px;color:${COLORS.ink3};">${esc(p!.label)}<br><span style="font-size:15px;font-weight:700;color:${numColor(p!.pct)};">${num(p!.pct)}</span>${p!.perYear !== null ? `<br><span style="font-size:11px;">${esc(fmtPct(p!.perYear))} a year</span>` : ""}</td>`)
    .join("");
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
      ${f.detail && f.detail.length ? `<tr><td style="padding:10px 20px 0 20px;">${para(f.detail.join(" "))}</td></tr>` : ""}
      <tr><td style="padding:6px 20px ${long.length ? "6px" : "18px"} 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:0 20px 0 0;font-size:13px;color:${COLORS.ink3};">Price (NAV), ${esc(fmtDate(f.asOf, false))}<br><span style="font-size:18px;font-weight:800;color:${COLORS.ink};">${esc(fmtNav(f.nav))}</span></td>
          ${cell("This week", c.fund.week)}${cell("Last month", c.fund.month)}${cell("Year so far", c.fund.ytd)}
        </tr></table>
      </td></tr>
      ${long.length ? `<tr><td style="padding:6px 20px 18px 20px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${longCells}</tr></table></td></tr>` : ""}
    </table>
  </td></tr>`;
}

function headlinesHtml(report: ReportJson): string {
  const heads = report.marketContext.news.headlines;
  if (heads.length === 0) return "";
  const items = heads
    .map((h) => {
      const url = safeUrl(h.url);
      const t = url ? `<a href="${url}" style="color:${COLORS.ink};font-weight:600;text-decoration:none;">${esc(h.title)}</a>` : `<span style="font-weight:600;color:${COLORS.ink};">${esc(h.title)}</span>`;
      return `<div style="padding:6px 0;border-top:1px solid ${COLORS.line};font-size:14px;line-height:1.4;">${t}<br><span style="font-size:12px;color:${COLORS.ink3};">${esc(h.source)}</span></div>`;
    })
    .join("");
  return `${h2("Everything we read this week")}${card(`<div style="font-size:12px;color:${COLORS.ink3};margin-bottom:4px;">Source: ${esc(SOURCE_LABEL[report.marketContext.news.source] ?? "")}</div>${items}`)}`;
}

export function buildEmail(report: ReportJson, opts: { siteUrl?: string; test?: boolean } = {}): BuiltEmail {
  const funds = [...report.funds].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const v = VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE[VERDICTS.none];
  const site = opts.siteUrl?.replace(/\/+$/, "");
  const subject = `${opts.test ? "[Test] " : ""}Your Saturday money report: ${report.verdict}`;
  const writtenBy = report.writer.kind === "gemini" ? "Words written by Google Gemini and checked against the numbers." : "Words written by our built-in template (the AI writer was not available this time).";
  const m = report.marketContext;
  const hasWhy = (m.overview ?? []).length > 0 || (m.drivers ?? []).length > 0 || m.indexMoves.some((x) => x.week !== null);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(report.verdictReason)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">
    <tr><td style="padding:0 4px 14px 4px;">
      <div style="font-size:17px;font-weight:800;color:${COLORS.ink};">Meera&#39;s Money Check &middot; Weekly report</div>
      <div style="font-size:13px;color:${COLORS.ink3};">Week ending ${esc(fmtDate(report.weekEnding))}${opts.test ? " &middot; this is a test email" : ""}</div>
    </td></tr>
    <tr><td style="padding:0 0 16px 0;">
      <div style="background:${v.bg};border-radius:14px;padding:20px;">
        <div style="font-size:24px;font-weight:800;color:${COLORS.ink};">${esc(report.verdict)}</div>
        <div style="margin-top:8px;font-size:16px;line-height:1.5;color:${COLORS.ink2};">${esc(report.verdictReason)}</div>
      </div>
    </td></tr>
    ${h2("The week at a glance")}
    ${glanceHtml(funds)}
    ${hasWhy ? `${h2("How the markets did, and why")}${marketHtml(report)}` : ""}
    ${h2("Each fund, in detail")}
    ${funds.map(fundHtml).join("")}
    ${headlinesHtml(report)}
    ${site ? `<tr><td align="center" style="padding:6px 0 18px 0;"><a href="${esc(site)}/report" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">Open the full report online</a></td></tr>` : ""}
    <tr><td style="padding:4px 4px 0 4px;font-size:12px;line-height:1.5;color:${COLORS.ink3};">
      ${m.notices.map((n) => `${esc(n)}<br>`).join("")}${esc(writtenBy)} All figures are worked out by code from public price data. This is information to help you understand your funds, not investment advice.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const pct = (n: number | null) => fmtPct(n);
  const text = [
    `Meera's Money Check - Weekly report${opts.test ? " (test email)" : ""}`,
    `Week ending ${fmtDate(report.weekEnding)}`,
    "",
    report.verdict.toUpperCase(),
    report.verdictReason,
    "",
    "THE WEEK AT A GLANCE",
    ...funds.map((f) => `- ${shortName(f.name)} (${f.slot}): week ${pct(f.comparison.fund.week)}, month ${pct(f.comparison.fund.month)}, year so far ${pct(f.comparison.fund.ytd)}`),
    "",
    ...(hasWhy
      ? [
          "HOW THE MARKETS DID, AND WHY",
          ...m.indexMoves.filter((x) => x.week !== null).map((x) => `- ${x.name}: ${pct(x.week)} this week`),
          ...((m.overview ?? []).length ? ["", m.overview!.join(" ")] : []),
          ...(m.drivers ?? []).flatMap((d) => ["", d.text, `  ${d.headline} (${d.source})${d.url ? ` ${d.url}` : ""}`]),
          "",
        ]
      : []),
    "EACH FUND, IN DETAIL",
    "",
    ...funds.flatMap((f) => [
      `${f.slot.toUpperCase()}: ${shortName(f.name)}${peerStanding(f.comparison.gapVsCategory.month, f.comparison.peersUsed) === "ahead" ? "  (Outperforming)" : ""}`,
      ...f.sentences.map((s, i) => `  ${i + 1}. ${s}`),
      ...(f.detail && f.detail.length ? ["", `  ${f.detail.join(" ")}`] : []),
      "",
      `  Price (NAV) ${fmtNav(f.nav)} as of ${fmtDate(f.asOf, false)} | This week ${pct(f.comparison.fund.week)} | Last month ${pct(f.comparison.fund.month)} | Year so far ${pct(f.comparison.fund.ytd)}`,
      ...LONG_TERM.flatMap((k) => {
        const p = f.periods?.find((x) => x.key === k);
        return p && p.pct !== null ? [`  ${p.label}: ${pct(p.pct)}${p.perYear !== null ? ` (${pct(p.perYear)} a year)` : ""}`] : [];
      }),
      "",
    ]),
    ...(m.news.headlines.length ? ["EVERYTHING WE READ THIS WEEK", ...m.news.headlines.map((h) => `- ${h.title} (${h.source})${h.url ? ` ${h.url}` : ""}`), ""] : []),
    ...(site ? [`Open the full report online: ${site}/report`, ""] : []),
    ...m.notices,
    writtenBy,
    "All figures are worked out by code from public price data. This is information to help you understand your funds, not investment advice.",
  ].join("\n");

  return { subject, html, text };
}
