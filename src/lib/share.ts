/**
 * "Send to my CA": the plain message, WhatsApp / email links and a CSV, built from the stored report.
 * Pure functions (no network); every figure comes from the report, nothing is recomputed here.
 */
import { fmtDate, fmtNav, fmtPct } from "./format";
import type { ReportJson } from "./report-types";

const APP_NAME = "Meera's Money Check";

export function buildShareText(report: ReportJson): string {
  const lines: string[] = [];
  lines.push(`Mutual fund update, week ending ${fmtDate(report.weekEnding)}`);
  lines.push("");
  report.funds.forEach((f, i) => {
    const c = f.comparison.fund;
    lines.push(`${i + 1}) ${f.name}`);
    lines.push(`   Scheme code: ${f.schemeCode}`);
    lines.push(`   NAV: ${fmtNav(f.nav)} (as of ${fmtDate(f.asOf)})`);
    lines.push(`   Week ${fmtPct(c.week)} | Month ${fmtPct(c.month)} | Year so far ${fmtPct(c.ytd)}`);
  });
  lines.push("");
  lines.push(`Overall: ${report.verdict}. ${report.verdictReason}`);
  lines.push("");
  lines.push(`Sent from ${APP_NAME}`);
  return lines.join("\n");
}

export const shareSubject = (report: ReportJson) => `My mutual fund NAVs, week ending ${fmtDate(report.weekEnding)}`;

/** Opens WhatsApp (app or web) with the message ready to send. The CA's number is chosen in WhatsApp. */
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const mailtoLink = (subject: string, text: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per fund: easy to paste into the CA's spreadsheet. */
export function buildShareCsv(report: ReportJson): string {
  const head = ["Fund", "Scheme code", "NAV", "NAV date", "Week %", "Month %", "Year so far %"];
  const round = (n: number | null) => (n === null ? null : Number(n.toFixed(2)));
  const rows = report.funds.map((f) => [f.name, f.schemeCode, f.nav, f.asOf, round(f.comparison.fund.week), round(f.comparison.fund.month), round(f.comparison.fund.ytd)]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export const csvDataUri = (csv: string) => `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
