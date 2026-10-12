import { describe, expect, it, vi, type Mock } from "vitest";
import { VERDICTS } from "../config";
import type { ReportJson } from "../report-types";
import { EmailError } from "../sources/resend";
import { maskEmail, readEmailConfig, sendTestEmail, sendWeeklyEmail, type EmailDeps } from "./email";

const report = {
  weekEnding: "2026-10-10", generatedAt: "", language: "en", verdict: VERDICTS.none, verdictReason: "Fine.",
  funds: [{ schemeCode: 1, name: "Test Fund", slot: "Large Cap", status: "green", weeksLagging: 0, nav: 10, asOf: "2026-10-09", referenceLabel: "x", dataNotes: [], sentences: ["a.", "b.", "c."],
    comparison: { fund: { week: 1, month: 1, ytd: 1 }, gapVsCategory: { week: 0, month: 0, ytd: 0 }, peersUsed: 3, peersRequested: 3, benchmarkName: null } }],
  marketContext: { indexMoves: [], news: { source: "gnews", note: "", headlines: [] }, notices: [] },
  writer: { kind: "gemini", model: "m", reason: null },
} as unknown as ReportJson;

const okConfig = { config: { apiKey: "re_x", from: "F <f@x.dev>", to: ["meera@example.com"], siteUrl: "https://site.test" } };
type Fakes = EmailDeps & { claim: Mock; finish: Mock; send: Mock };
function deps(over: Record<string, unknown> = {}): Fakes {
  return {
    config: () => okConfig,
    claim: vi.fn(async () => ({ id: "log1" })),
    finish: vi.fn(async () => undefined),
    send: vi.fn(async () => ({ id: "em_1" })),
    ...over,
  } as unknown as Fakes;
}

describe("readEmailConfig", () => {
  it("is skipped (with a reason) until the key and an address are set", () => {
    expect(readEmailConfig({})).toEqual({ missing: expect.stringContaining("RESEND_API_KEY") });
    expect(readEmailConfig({ RESEND_API_KEY: "k" })).toEqual({ missing: expect.stringContaining("REPORT_EMAIL_TO") });
  });
  it("accepts several addresses and defaults the sender", () => {
    const r = readEmailConfig({ RESEND_API_KEY: "k", REPORT_EMAIL_TO: "a@x.com, b@y.org;c@z.in", SITE_URL: " https://s.test " });
    expect("config" in r && r.config.to).toEqual(["a@x.com", "b@y.org", "c@z.in"]);
    expect("config" in r && r.config.from).toContain("onboarding@resend.dev");
    expect("config" in r && r.config.siteUrl).toBe("https://s.test");
  });
  it("rejects things that are not email addresses", () => {
    expect(readEmailConfig({ RESEND_API_KEY: "k", REPORT_EMAIL_TO: "meera" })).toEqual({ missing: expect.stringContaining("do not look like email addresses") });
  });
  it("masks addresses for display", () => expect(maskEmail("meera@example.com")).toBe("m***@example.com"));
});

describe("sendWeeklyEmail", () => {
  it("skips quietly when email is not set up (nothing claimed, nothing sent)", async () => {
    const d = deps({ config: () => ({ missing: "Email is not set up yet (RESEND_API_KEY is missing)." }) });
    const r = await sendWeeklyEmail(report, d);
    expect(r.status).toBe("skipped");
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("claims the week, sends once with a per-week idempotency key, and records success", async () => {
    const d = deps();
    const r = await sendWeeklyEmail(report, d);
    expect(r).toMatchObject({ status: "sent", recipients: 1, id: "em_1" });
    expect(d.claim).toHaveBeenCalledWith("2026-10-10", 1);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send.mock.calls[0][0]).toMatchObject({ to: ["meera@example.com"], idempotencyKey: "weekly-report-2026-10-10" });
    expect(d.send.mock.calls[0][0].subject).toBe("Your Saturday money check-up: No action needed");
    expect(d.finish).toHaveBeenCalledWith("log1", { status: "sent", providerId: "em_1" });
  });

  it("never sends twice for the same week", async () => {
    const d = deps({ claim: vi.fn(async () => "exists" as const) });
    const r = await sendWeeklyEmail(report, d);
    expect(r.status).toBe("skipped");
    expect(r.reason).toContain("already sent");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("records a failure (so a retry is allowed) and explains it", async () => {
    const d = deps({ send: vi.fn(async () => { throw new EmailError("Resend only lets you email your own address until you verify a domain."); }) });
    const r = await sendWeeklyEmail(report, d);
    expect(r.status).toBe("failed");
    expect(r.reason).toContain("verify a domain");
    expect(d.finish).toHaveBeenCalledWith("log1", { status: "failed", error: expect.stringContaining("verify a domain") });
  });

  it("sends nothing if it cannot check the log (better no email than a duplicate)", async () => {
    const d = deps({ claim: vi.fn(async () => { throw new Error('relation "email_log" does not exist'); }) });
    const r = await sendWeeklyEmail(report, d);
    expect(r.status).toBe("failed");
    expect(r.reason).toContain("002_email_log.sql");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("still reports failure if even the failure note cannot be saved", async () => {
    const d = deps({ send: vi.fn(async () => { throw new Error("network down"); }), finish: vi.fn(async () => { throw new Error("db down"); }) });
    const r = await sendWeeklyEmail(report, d);
    expect(r.status).toBe("failed");
  });
});

describe("sendTestEmail", () => {
  const env = { RESEND_API_KEY: "k", REPORT_EMAIL_TO: "meera@example.com" };
  it("sends a clearly marked test, without an idempotency key, and masks the address in its message", async () => {
    const send = vi.fn(async () => ({ id: "em_t" }));
    const r = await sendTestEmail(report, send, env);
    expect(r.status).toBe("sent");
    expect(r.reason).toContain("m***@example.com");
    const arg = (send.mock.calls[0] as unknown as [{ subject: string; idempotencyKey?: string }])[0];
    expect(arg.subject.startsWith("[Test] ")).toBe(true);
    expect(arg.idempotencyKey).toBeUndefined();
  });
  it("is skipped when email is not set up", async () => {
    expect((await sendTestEmail(report, vi.fn(), {})).status).toBe("skipped");
  });
});
