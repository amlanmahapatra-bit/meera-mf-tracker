/** Sends one email through Resend (https://resend.com/docs/api-reference/emails/send-email). Plain fetch, no SDK. */
import { fetchRetry } from "../http";

export type SendInput = {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Resend ignores a second request with the same key within 24 hours, so a retry can never send twice. */
  idempotencyKey?: string;
};

export class EmailError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** Turns Resend's error replies into sentences Meera (or her helper) can act on. */
export function explainResendError(status: number, apiMessage: string): string {
  const m = apiMessage || "";
  if (status === 401) return "Resend did not accept the API key. Check RESEND_API_KEY.";
  if (status === 403 && /only send testing emails to your own email/i.test(m)) {
    return "Resend only lets you email your own address until you verify a domain at resend.com/domains. Either send to your own Resend address, or verify a domain and use it in RESEND_FROM.";
  }
  if (status === 403 || /domain is not verified/i.test(m)) return "Resend does not allow this sender address. Use onboarding@resend.dev for testing, or verify your own domain.";
  if (status === 422 || status === 400) return `Resend rejected the email: ${m || "check the sender and recipient addresses"}.`;
  if (status === 429) return "Resend is limiting how fast we send (free plan: 100 emails a day). It will work on the next try.";
  if (status === 402) return "The Resend account has no sending allowance left.";
  return `Resend had a problem (HTTP ${status}). ${m}`.trim();
}

export async function sendViaResend(input: SendInput): Promise<{ id: string }> {
  const res = await fetchRetry("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: input.from, to: input.to, subject: input.subject, html: input.html, text: input.text }),
    timeoutMs: 20_000,
    retries: 2, // network errors, 429 and 5xx are retried with backoff
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) throw new EmailError(explainResendError(res.status, body.message ?? ""), res.status);
  if (!body.id) throw new EmailError("Resend accepted the request but did not return an email id.");
  return { id: body.id };
}
