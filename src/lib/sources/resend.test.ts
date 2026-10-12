import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailError, explainResendError, sendViaResend } from "./resend";

const input = { apiKey: "re_test", from: "A <a@x.dev>", to: ["m@x.com"], subject: "S", html: "<p>h</p>", text: "t", idempotencyKey: "weekly-report-2026-10-10" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("explainResendError", () => {
  it("explains the 'only your own address' rule in plain words", () => {
    const t = explainResendError(403, "You can only send testing emails to your own email address (you@x.com). To send emails to other recipients, please verify a domain");
    expect(t).toContain("verify a domain");
    expect(t).toContain("your own address");
  });
  it("covers key, rate limit, validation and unknown errors", () => {
    expect(explainResendError(401, "")).toContain("RESEND_API_KEY");
    expect(explainResendError(429, "")).toContain("100 emails a day");
    expect(explainResendError(422, "Invalid `to` field")).toContain("Invalid `to` field");
    expect(explainResendError(500, "boom")).toContain("HTTP 500");
  });
});

describe("sendViaResend", () => {
  it("posts to Resend with the key, the idempotency key and the right body", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: "em_123" }));
    const r = await sendViaResend(input);
    expect(r.id).toBe("em_123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(init.headers["Idempotency-Key"]).toBe("weekly-report-2026-10-10");
    const b = JSON.parse(init.body);
    expect(b).toMatchObject({ from: "A <a@x.dev>", to: ["m@x.com"], subject: "S", html: "<p>h</p>", text: "t" });
  });
  it("turns a 403 into a plain explanation (no retry on a client error)", async () => {
    fetchMock.mockResolvedValue(json(403, { message: "You can only send testing emails to your own email address (a@b.com)." }));
    await expect(sendViaResend(input)).rejects.toThrow(/verify a domain/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries a busy Resend (503) and then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(json(503, { message: "busy" })).mockResolvedValueOnce(json(200, { id: "em_9" }));
    const p = sendViaResend(input);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await p).id).toBe("em_9");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe("weekly-report-2026-10-10"); // same key on the retry
  });
  it("fails clearly when Resend says OK but sends no id", async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await expect(sendViaResend(input)).rejects.toBeInstanceOf(EmailError);
  });
});
