import { describe, expect, it } from "vitest";
import { VERDICTS } from "./config";
import { candidateVerdict, fundStatus, isBehindThisWeek, nextWeeksLagging, peerStanding, type FundFlagInput } from "./status";
import { istToday, weekEndingFor } from "./dates";

describe("fundStatus", () => {
  it("is green when level with or slightly behind the reference", () => {
    expect(fundStatus(0.5, 0)).toBe("green");
    expect(fundStatus(-1.0, 0)).toBe("green"); // boundary is inclusive
  });
  it("is amber for a moderate gap", () => {
    expect(fundStatus(-1.01, 0)).toBe("amber");
    expect(fundStatus(-3.0, 0)).toBe("amber"); // boundary is inclusive
  });
  it("is red for a large gap", () => expect(fundStatus(-3.01, 0)).toBe("red"));
  it("a long losing streak raises the flag even when the gap looks fine", () => {
    expect(fundStatus(0, 3)).toBe("green");
    expect(fundStatus(0, 4)).toBe("amber");
    expect(fundStatus(0, 8)).toBe("red");
  });
  it("takes the worse of gap and streak", () => expect(fundStatus(-1.5, 8)).toBe("red"));
  it("says unknown (not green) when there is no gap and no streak", () => expect(fundStatus(null, 0)).toBe("unknown"));
  it("still flags a long streak when the gap is unknown", () => expect(fundStatus(null, 5)).toBe("amber"));
});

describe("tracking allowance (funds that cannot follow their index closely)", () => {
  it("widens the green and amber limits by the allowance", () => {
    expect(fundStatus(-1.4, 0)).toBe("amber");
    expect(fundStatus(-1.4, 0, 1.5)).toBe("green"); // inside -1.0 - 1.5
    expect(fundStatus(-3.4, 0, 1.5)).toBe("amber"); // inside -3.0 - 1.5
    expect(fundStatus(-4.6, 0, 1.5)).toBe("red");
  });
  it("still flags a real, large gap", () => {
    expect(fundStatus(-6, 0, 1.5)).toBe("red");
  });
  it("a week only counts as behind when it trails by more than the tolerance plus the allowance", () => {
    expect(isBehindThisWeek(-1.0)).toBe(true);
    expect(isBehindThisWeek(-1.0, 1.5)).toBe(false);
    expect(nextWeeksLagging(3, -1.0, 1.5)).toBe(0);
    expect(nextWeeksLagging(3, -2.0, 1.5)).toBe(4);
  });
  it("an allowance of zero changes nothing", () => {
    expect(fundStatus(-1.4, 0, 0)).toBe(fundStatus(-1.4, 0));
  });
});

describe("weeks lagging", () => {
  it("ignores tiny noise", () => {
    expect(isBehindThisWeek(-0.2)).toBe(false);
    expect(isBehindThisWeek(-0.3)).toBe(true);
    expect(isBehindThisWeek(null)).toBeNull();
  });
  it("extends, resets and preserves the streak", () => {
    expect(nextWeeksLagging(2, -1)).toBe(3);
    expect(nextWeeksLagging(5, 0.4)).toBe(0);
    expect(nextWeeksLagging(5, null)).toBe(5);
  });
});

const fund = (slot: string, status: FundFlagInput["status"], monthGap: number | null = 0, weeksLagging = 0): FundFlagInput => ({
  slot, status, monthGap, weeksLagging, referenceLabel: "the market",
});

describe("candidateVerdict", () => {
  it("no flagged funds -> No action needed", () => {
    const v = candidateVerdict([fund("Large Cap", "green"), fund("Mid Cap", "green")]);
    expect(v.verdict).toBe(VERDICTS.none);
    expect(v.flaggedSlots).toEqual([]);
  });
  it("exactly one flagged fund -> worth watching, naming it with a specific reason", () => {
    const v = candidateVerdict([fund("Large Cap", "green"), fund("Mid Cap", "amber", -2.3)]);
    expect(v.verdict).toBe(VERDICTS.watch);
    expect(v.reason).toContain("Mid Cap");
    expect(v.reason).toContain("2.3% worse than the market");
  });
  it("two or more flagged funds -> consider reviewing", () => {
    const v = candidateVerdict([fund("Mid Cap", "amber", -2), fund("Small Cap", "red", -5), fund("Large Cap", "green")]);
    expect(v.verdict).toBe(VERDICTS.review);
    expect(v.reason).toContain("Small Cap"); // the worst fund is named
  });
  it("mentions funds that could not be checked", () => {
    const v = candidateVerdict([fund("Large Cap", "green"), fund("Intl", "unknown", null)]);
    expect(v.verdict).toBe(VERDICTS.none);
    expect(v.reason).toContain("1 fund could not be checked");
  });
  it("only ever returns one of the three exact verdict strings", () => {
    const all = new Set<string>(Object.values(VERDICTS));
    for (const set of [[fund("a", "green")], [fund("a", "red", -9)], [fund("a", "red", -9), fund("b", "amber", -2)]]) {
      expect(all.has(candidateVerdict(set).verdict)).toBe(true);
    }
  });
  it("mentions a losing streak in the reason", () => {
    const v = candidateVerdict([fund("Mid Cap", "amber", 0, 5)]);
    expect(v.reason).toContain("behind for 5 weeks in a row");
  });
});

describe("dates", () => {
  it("finds the Saturday a report belongs to", () => {
    expect(weekEndingFor("2026-10-10")).toBe("2026-10-10"); // Saturday stays
    expect(weekEndingFor("2026-10-11")).toBe("2026-10-10"); // Sunday
    expect(weekEndingFor("2026-10-12")).toBe("2026-10-10"); // Monday
    expect(weekEndingFor("2026-10-16")).toBe("2026-10-10"); // Friday
    expect(weekEndingFor("2026-10-17")).toBe("2026-10-17"); // next Saturday
  });
  it("converts UTC to India time across midnight", () => {
    // 20:00 UTC on Fri 9 Oct is already 01:30 on Sat 10 Oct in India.
    expect(istToday(Date.UTC(2026, 9, 9, 20, 0))).toBe("2026-10-10");
    expect(istToday(Date.UTC(2026, 9, 9, 10, 0))).toBe("2026-10-09");
  });
});

describe("peerStanding (the Outperforming label)", () => {
  it("ahead when at least 0.5 points above similar funds over the month", () => {
    expect(peerStanding(1.6, 5)).toBe("ahead");
    expect(peerStanding(0.5, 3)).toBe("ahead"); // boundary is inclusive
  });
  it("behind when at least 0.5 points below", () => {
    expect(peerStanding(-0.5, 4)).toBe("behind");
    expect(peerStanding(-2, 9)).toBe("behind");
  });
  it("level in between", () => {
    expect(peerStanding(0.49, 9)).toBe("level");
    expect(peerStanding(-0.49, 9)).toBe("level");
    expect(peerStanding(0, 9)).toBe("level");
  });
  it("says nothing with too few similar funds or no data", () => {
    expect(peerStanding(3, 1)).toBeNull();
    expect(peerStanding(3, 0)).toBeNull();
    expect(peerStanding(null, 9)).toBeNull();
  });
});
