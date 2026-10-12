import { describe, expect, it } from "vitest";
import { selectHeadlines, type Headline } from "./news";

const NOW = Date.parse("2026-10-10T08:00:00Z");
const h = (title: string, topic: Headline["topic"], day: number, extra: Partial<Headline> = {}): Headline => ({
  title, topic, source: "Src", url: `https://x/${title}`, publishedAt: `2026-10-${String(day).padStart(2, "0")}T06:00:00Z`, description: null, ...extra,
});

describe("selectHeadlines", () => {
  it("drops off-topic stories, duplicates and old news", () => {
    const out = selectHeadlines([
      h("Sensex rises as FII buying returns", "india", 9),
      h("Sensex rises as FII buying returns!", "india", 9), // same story, different punctuation
      h("Celebrity wedding photos go viral", "india", 9), // not about markets
      h("Nifty slips on old news", "india", 1), // outside the 7-day window
    ], 12, NOW);
    expect(out.map((x) => x.title)).toEqual(["Sensex rises as FII buying returns"]);
  });

  it("takes turns between topics so one busy topic cannot crowd out the others", () => {
    const items = [
      ...[1, 2, 3, 4, 5, 6].map((i) => h(`Sensex news number ${i}`, "india", 9, { publishedAt: `2026-10-09T0${i}:00:00Z` })),
      h("RBI keeps repo rate steady", "economy", 8),
      h("Nasdaq hits a record on tech earnings", "global", 8),
    ];
    const out = selectHeadlines(items, 4, NOW).map((x) => x.topic);
    expect(out).toContain("economy");
    expect(out).toContain("global");
    expect(out).toHaveLength(4);
  });

  it("returns newest first and respects the maximum", () => {
    const out = selectHeadlines([h("Sensex a", "india", 6), h("Sensex b", "india", 9), h("Sensex c", "india", 8)], 2, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].publishedAt! >= out[1].publishedAt!).toBe(true);
  });

  it("keeps useful summaries, shortens very long ones, and drops boilerplate or tiny ones", () => {
    const out = selectHeadlines([
      h("Sensex a", "india", 9, { description: "Crude oil prices above $100 a barrel and inflation data are the main factors for the stock market." }),
      h("Sensex b", "india", 9, { description: "Business News: Get the latest Business News, Live Share & Stock Market Updates." }),
      h("Sensex c", "india", 9, { description: "Short." }),
      h("Sensex d", "india", 9, { description: "x".repeat(500) }),
    ], 12, NOW);
    const by = Object.fromEntries(out.map((x) => [x.title, x.description]));
    expect(by["Sensex a"]).toContain("Crude oil prices above $100");
    expect(by["Sensex b"]).toBeNull();
    expect(by["Sensex c"]).toBeNull();
    expect(by["Sensex d"]!.length).toBeLessThanOrEqual(260);
  });
});
