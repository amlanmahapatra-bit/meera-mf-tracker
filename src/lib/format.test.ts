import { describe, expect, it } from "vitest";
import { fmtDate, fmtNav, fmtPct, fmtPoints, moveWord, toneClass } from "./format";

describe("fmtPct", () => {
  it("shows a plus or a real minus sign", () => {
    expect(fmtPct(0.44)).toBe("+0.4%");
    expect(fmtPct(-3.9)).toBe("−3.9%");
  });
  it("shows zero without a sign, including tiny values that round to zero", () => {
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(-0.04)).toBe("0.0%");
    expect(fmtPct(0.04)).toBe("0.0%");
  });
  it("can hide the plus sign and change the digits", () => {
    expect(fmtPct(2.28, { sign: false })).toBe("2.3%");
    expect(fmtPct(2.28, { digits: 2 })).toBe("+2.28%");
  });
  it("handles missing numbers", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(undefined)).toBe("—");
    expect(fmtPct(NaN)).toBe("—");
  });
});

describe("other formatters", () => {
  it("points", () => {
    expect(fmtPoints(0.3)).toBe("0.3 points");
    expect(fmtPoints(-1.04)).toBe("1.0 point");
    expect(fmtPoints(null)).toBe("—");
  });
  it("NAV keeps up to 4 decimals and at least 2", () => {
    expect(fmtNav(50.461)).toBe("₹50.461");
    expect(fmtNav(35)).toBe("₹35.00");
    expect(fmtNav(39.2222)).toBe("₹39.2222");
    expect(fmtNav(null)).toBe("—");
  });
  it("dates", () => {
    expect(fmtDate("2026-10-09")).toBe("9 Oct 2026");
    expect(fmtDate("2026-01-31", false)).toBe("31 Jan");
    expect(fmtDate("nonsense")).toBe("—");
    expect(fmtDate(null)).toBe("—");
  });
  it("words and tones never rely on colour alone", () => {
    expect(moveWord(1)).toBe("up");
    expect(moveWord(-1)).toBe("down");
    expect(moveWord(0.01)).toBe("flat");
    expect(toneClass(1)).toContain("good");
    expect(toneClass(-1)).toContain("bad");
    expect(toneClass(0)).toContain("ink-2");
  });
});
