import { describe, expect, it, vi } from "vitest";
import { catchUpWeek, catchUpWeeklyEmail, type CatchUpDeps } from "./catchup";
import { weekEndingFor } from "../dates";

const deps = (over: Partial<CatchUpDeps> = {}): CatchUpDeps => ({
  emailReady: () => true,
  alreadySent: vi.fn(async () => false),
  runWeek: vi.fn(async () => ({ runId: "r", status: "success" as const, details: {} })),
  ...over,
});

describe("which Saturday a report belongs to", () => {
  it("a Saturday run reports that same Saturday (not the week before)", () => {
    expect(weekEndingFor("2026-10-17")).toBe("2026-10-17");
    expect(weekEndingFor("2026-10-24")).toBe("2026-10-24");
  });
  it("on other days it is the most recent Saturday", () => {
    expect(weekEndingFor("2026-10-12")).toBe("2026-10-10"); // Monday
    expect(weekEndingFor("2026-10-16")).toBe("2026-10-10"); // Friday: the new week's report is not due yet
    expect(weekEndingFor("2026-10-18")).toBe("2026-10-17"); // Sunday
  });
});

describe("catch-up for a missed Saturday email", () => {
  it("only acts on Sunday, Monday and Tuesday after a Saturday", () => {
    expect(catchUpWeek("2026-10-17")).toBeNull(); // Saturday: the weekly job does it
    expect(catchUpWeek("2026-10-18")).toBe("2026-10-17");
    expect(catchUpWeek("2026-10-20")).toBe("2026-10-17");
    expect(catchUpWeek("2026-10-21")).toBeNull(); // Wednesday: too late
  });
  it("does nothing when the email already went out", async () => {
    const d = deps({ alreadySent: vi.fn(async () => true) });
    expect((await catchUpWeeklyEmail("2026-10-18", d)).action).toBe("already_sent");
    expect(d.runWeek).not.toHaveBeenCalled();
  });
  it("re-sends that Saturday's report when the email is missing", async () => {
    const d = deps();
    const r = await catchUpWeeklyEmail("2026-10-18", d);
    expect(r).toMatchObject({ action: "retried", weekEnding: "2026-10-17" });
    expect(d.runWeek).toHaveBeenCalledWith("2026-10-17");
  });
  it("never sends blind if it cannot read the email log", async () => {
    const d = deps({ alreadySent: vi.fn(async () => { throw new Error("db down"); }) });
    expect((await catchUpWeeklyEmail("2026-10-18", d)).action).toBe("check_failed");
    expect(d.runWeek).not.toHaveBeenCalled();
  });
  it("stays out of the way when email is not set up or it is not a catch-up day", async () => {
    expect((await catchUpWeeklyEmail("2026-10-18", deps({ emailReady: () => false }))).action).toBe("email_not_set_up");
    expect((await catchUpWeeklyEmail("2026-10-14", deps())).action).toBe("not_needed");
  });
});
