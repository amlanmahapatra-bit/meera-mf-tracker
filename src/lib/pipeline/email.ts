/**
 * The weekly email step. Safe by design:
 *  - it only runs when asked (the Saturday job asks; "Update now" does not),
 *  - it first "claims" the week in email_log, so a re-run, a retry or two jobs at once can never send twice,
 *  - a failure is recorded and reported but never breaks the saved report.
 */
import { buildEmail } from "../email";
import { buildReportPdf } from "../report-pdf";
import { getSupabase } from "../supabase";
import type { ReportJson } from "../report-types";
import { EmailError, sendViaResend } from "../sources/resend";

export type EmailConfig = { apiKey: string; from: string; to: string[]; siteUrl?: string };
export type EmailOutcome = { status: "sent" | "skipped" | "failed"; reason: string; recipients: number; id?: string };

/** Reads the email settings. null (with a reason) when something needed is missing, which just skips the step. */
export function readEmailConfig(env: Record<string, string | undefined> = process.env): { config: EmailConfig } | { missing: string } {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to = (env.REPORT_EMAIL_TO ?? "").split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
  if (!apiKey) return { missing: "Email is not set up yet (RESEND_API_KEY is missing)." };
  if (to.length === 0) return { missing: "Email is not set up yet (REPORT_EMAIL_TO has no address)." };
  const bad = to.filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  if (bad.length) return { missing: `These do not look like email addresses: ${bad.join(", ")}.` };
  return { config: { apiKey, to, from: env.RESEND_FROM?.trim() || "Trackerr <onboarding@resend.dev>", siteUrl: env.SITE_URL?.trim() || undefined } };
}

/** The report as a PDF attachment. If the PDF cannot be made, the email still goes out without it. */
async function pdfAttachment(report: ReportJson): Promise<NonNullable<Parameters<typeof sendViaResend>[0]["attachments"]>> {
  try {
    return [{ filename: `Trackerr-weekly-report-${report.weekEnding}.pdf`, content: await buildReportPdf(report) }];
  } catch {
    return [];
  }
}

export const maskEmail = (a: string): string => a.replace(/^(.).*(@.*)$/, "$1***$2");

/** What the weekly step needs from the outside world. Real versions below; tests pass fakes. */
export type EmailDeps = {
  config: () => { config: EmailConfig } | { missing: string };
  /** Reserve this week. Returns an id, or "exists" if the week was already sent / is being sent. */
  claim: (weekEnding: string, recipients: number) => Promise<{ id: string } | "exists">;
  finish: (id: string, result: { status: "sent" | "failed"; providerId?: string; error?: string }) => Promise<void>;
  send: typeof sendViaResend;
};

export async function sendWeeklyEmail(report: ReportJson, deps: EmailDeps = realDeps): Promise<EmailOutcome> {
  const cfg = deps.config();
  if ("missing" in cfg) return { status: "skipped", reason: cfg.missing, recipients: 0 };
  const { config } = cfg;

  let claim: { id: string } | "exists";
  try {
    claim = await deps.claim(report.weekEnding, config.to.length);
  } catch (e) {
    return { status: "failed", reason: `Could not check whether this week was already emailed (${(e as Error).message}). Nothing was sent, to be safe. Run sql/002_email_log.sql in Supabase if you have not yet.`, recipients: 0 };
  }
  if (claim === "exists") return { status: "skipped", reason: `This week's email (week ending ${report.weekEnding}) was already sent.`, recipients: 0 };

  const mail = buildEmail(report, { siteUrl: config.siteUrl });
  try {
    const { id } = await deps.send({ apiKey: config.apiKey, from: config.from, to: config.to, subject: mail.subject, html: mail.html, text: mail.text, attachments: await pdfAttachment(report), idempotencyKey: `weekly-report-${report.weekEnding}` });
    await deps.finish(claim.id, { status: "sent", providerId: id });
    return { status: "sent", reason: `Emailed ${config.to.length} address${config.to.length === 1 ? "" : "es"}.`, recipients: config.to.length, id };
  } catch (e) {
    const message = e instanceof EmailError ? e.message : `Sending failed: ${(e as Error).message}`;
    await deps.finish(claim.id, { status: "failed", error: message }).catch(() => undefined);
    return { status: "failed", reason: message, recipients: 0 };
  }
}

/** A clearly labelled test email to the configured address(es). Not recorded as a weekly send, so it never blocks Saturday. */
export async function sendTestEmail(report: ReportJson, send: typeof sendViaResend = sendViaResend, env: Record<string, string | undefined> = process.env): Promise<EmailOutcome> {
  const cfg = readEmailConfig(env);
  if ("missing" in cfg) return { status: "skipped", reason: cfg.missing, recipients: 0 };
  const { config } = cfg;
  const mail = buildEmail(report, { siteUrl: config.siteUrl, test: true });
  try {
    const { id } = await send({ apiKey: config.apiKey, from: config.from, to: config.to, subject: mail.subject, html: mail.html, text: mail.text, attachments: await pdfAttachment(report) });
    return { status: "sent", reason: `Test email sent to ${config.to.map(maskEmail).join(", ")}.`, recipients: config.to.length, id };
  } catch (e) {
    return { status: "failed", reason: e instanceof EmailError ? e.message : `Sending failed: ${(e as Error).message}`, recipients: 0 };
  }
}

const realDeps: EmailDeps = {
  config: () => readEmailConfig(),
  async claim(weekEnding, recipients) {
    const { data, error } = await getSupabase().from("email_log").insert({ week_ending: weekEnding, kind: "weekly_report", recipients, status: "sending" }).select("id").single();
    if (error) {
      if (error.code === "23505") return "exists"; // the unique index: this week is already sent or being sent
      throw new Error(error.message);
    }
    return { id: (data as { id: string }).id };
  },
  async finish(id, r) {
    const { error } = await getSupabase().from("email_log").update({ status: r.status, provider_id: r.providerId ?? null, error: r.error ?? null, sent_at: r.status === "sent" ? new Date().toISOString() : null }).eq("id", id);
    if (error) console.error("Could not update email_log:", error.message);
  },
  send: sendViaResend,
};

/** For the settings screen: is email ready, who gets it (masked), and when did it last go out. */
export async function emailStatus(): Promise<{ configured: boolean; problem?: string; recipients: string[]; from?: string; tableReady: boolean; lastSent: string | null }> {
  const cfg = readEmailConfig();
  let tableReady = true;
  let lastSent: string | null = null;
  const { data, error } = await getSupabase().from("email_log").select("week_ending, sent_at").eq("kind", "weekly_report").eq("status", "sent").order("week_ending", { ascending: false }).limit(1);
  if (error) tableReady = false;
  else lastSent = (data?.[0] as { week_ending: string } | undefined)?.week_ending ?? null;
  if ("missing" in cfg) return { configured: false, problem: cfg.missing, recipients: [], tableReady, lastSent };
  return { configured: true, recipients: cfg.config.to.map(maskEmail), from: cfg.config.from, tableReady, lastSent };
}

