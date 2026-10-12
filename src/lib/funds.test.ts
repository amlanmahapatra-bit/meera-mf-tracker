import { afterEach, describe, expect, it } from "vitest";
import { isAdminAuthorized, isCronAuthorized, safeEqual } from "./auth";
import { coreName, parseAddFundInput, sameKind, suggestSlotAndBenchmark } from "./funds";

describe("suggestSlotAndBenchmark", () => {
  const s = (n: string, c?: string) => suggestSlotAndBenchmark(n, c);
  it("recognises the five starter funds", () => {
    expect(s("Bandhan Nifty 50 Index Fund - Direct Plan - Growth")).toMatchObject({ slot: "Large Cap", benchmarkName: "Nifty 50" });
    expect(s("Motilal Oswal Nifty Midcap 150 Index Fund - Direct Plan - Growth")).toMatchObject({ slot: "Mid Cap", benchmarkName: "Nifty Midcap 150" });
    expect(s("Motilal Oswal Nifty Smallcap 250 Index Fund - Direct Plan - Growth")).toMatchObject({ slot: "Small Cap", benchmarkName: "Nifty Smallcap 250" });
    expect(s("HDFC Short Term Fund - Direct Plan - Growth Option")).toMatchObject({ slot: "Short Duration Debt", benchmarkName: null });
    expect(s("Axis NASDAQ 100 US Specific Equity Passive FOF - Direct Plan - Growth Option")).toMatchObject({ slot: "International", benchmarkName: "Nasdaq 100" });
  });
  it("does not treat Nifty Next 50 as the Nifty 50", () => {
    expect(s("UTI Nifty Next 50 Index Fund Direct Growth").benchmarkName).toBeNull();
  });
  it("US funds without a Nasdaq index are International with no index", () => {
    expect(s("Motilal Oswal S&P 500 Index Fund - Direct Plan - Growth")).toMatchObject({ slot: "International", benchmarkName: null });
  });
  it("says 'Other' when it cannot tell", () => {
    expect(s("Quant Flexi Fund Direct Growth").slot).toBe("Other");
  });
});

describe("coreName", () => {
  it("strips the fund house and plan words", () => {
    expect(coreName("Bandhan Nifty 50 Index Fund - Direct Plan - Growth", "Bandhan")).toBe("Nifty 50 Index");
    expect(coreName("HDFC Short Term Fund - Direct Plan - Growth Option", "HDFC")).toBe("Short Term");
  });
});

describe("parseAddFundInput", () => {
  it("accepts good input and trims", () => {
    expect(parseAddFundInput({ schemeCode: "118482", slot: " Large Cap ", benchmarkName: "Nifty 50" })).toEqual({ ok: true, value: { schemeCode: 118482, slot: "Large Cap", benchmarkName: "Nifty 50" } });
  });
  it("allows no index", () => {
    const r = parseAddFundInput({ schemeCode: 1, slot: "Debt", benchmarkName: "" });
    expect(r.ok && r.value.benchmarkName).toBeNull();
  });
  it.each([
    [{ schemeCode: "abc", slot: "x1" }],
    [{ schemeCode: -5, slot: "Large Cap" }],
    [{ schemeCode: 1.5, slot: "Large Cap" }],
    [{ schemeCode: 1, slot: "" }],
    [{ schemeCode: 1, slot: "x".repeat(41) }],
    [{ schemeCode: 1, slot: "Large Cap", benchmarkName: "Made Up Index" }],
    [null],
  ])("rejects bad input %j", (body) => {
    const r = parseAddFundInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
});

describe("sameKind", () => {
  it("compares categories case-insensitively and allows unknowns", () => {
    expect(sameKind("Equity Scheme - Mid Cap Fund", "equity scheme - mid cap fund")).toBe(true);
    expect(sameKind("Equity Scheme - Mid Cap Fund", "Other Scheme - Gold ETF")).toBe(false);
    expect(sameKind(null, "x")).toBe(true);
  });
});

describe("auth", () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });

  it("safeEqual handles equal, different and different-length strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("cron: needs the exact bearer secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(req({ authorization: "Bearer s3cret" }))).toBe(true);
    expect(isCronAuthorized(req({ authorization: "Bearer wrong" }))).toBe(false);
    expect(isCronAuthorized(req({}))).toBe(false);
  });
  it("cron: refuses everything when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req({ authorization: "Bearer " }))).toBe(false);
    expect(isCronAuthorized(req({ authorization: "Bearer undefined" }))).toBe(false);
  });
  it("admin: needs the exact passcode header", () => {
    process.env.ADMIN_PASSCODE = "open-sesame";
    expect(isAdminAuthorized(req({ "x-admin-passcode": "open-sesame" }))).toBe(true);
    expect(isAdminAuthorized(req({ "x-admin-passcode": "nope" }))).toBe(false);
    expect(isAdminAuthorized(req({}))).toBe(false);
  });
  it("admin: refuses everything when no passcode is configured", () => {
    delete process.env.ADMIN_PASSCODE;
    expect(isAdminAuthorized(req({ "x-admin-passcode": "" }))).toBe(false);
  });
});
