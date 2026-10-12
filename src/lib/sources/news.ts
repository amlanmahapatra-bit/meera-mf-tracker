import { NEWS } from "../config";
import { optionalEnv } from "../env";
import { fetchRetry } from "../http";

export type Headline = { title: string; source: string; publishedAt: string | null; url: string };
export type NewsResult = {
  /** Which provider actually supplied the headlines, shown in the UI. */
  source: "gnews" | "google_news_rss" | "none";
  headlines: Headline[];
  /** Plain-language note about what happened (e.g. "GNews failed, used Google News instead"). */
  note: string;
};

// Two focused queries keep us at ~2 GNews requests a week (free plan allows ~100/day).
const QUERIES = [
  "India stock market OR Sensex OR Nifty OR FII OR RBI OR inflation",
  "global markets OR US Federal Reserve OR crude oil OR Nasdaq OR dollar rupee",
];

/** Keeps market and economy headlines; drops unrelated stories that a broad search can pull in. */
const RELEVANT = /market|sensex|nifty|stock|share|equit|rbi|reserve bank|inflation|cpi|fed\b|federal reserve|interest rate|repo|crude|oil\b|fii|fpi|rupee|dollar|gdp|economy|economic|earnings|bond|yield|nasdaq|wall street|dow\b|tariff|trade|budget|mutual fund|sebi|gold|currency|ipo|investor/i;

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function dedupeAndTrim(items: Headline[]): Headline[] {
  const seen = new Set<string>();
  const out: Headline[] = [];
  const cutoff = Date.now() - NEWS.lookbackDays * 86_400_000;
  const sorted = [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  for (const h of sorted) {
    if (h.publishedAt && Date.parse(h.publishedAt) < cutoff) continue;
    if (!RELEVANT.test(h.title)) continue;
    const key = normTitle(h.title).slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out.slice(0, NEWS.maxHeadlines);
}

async function fromGNews(key: string): Promise<Headline[]> {
  const from = new Date(Date.now() - NEWS.lookbackDays * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");
  const all: Headline[] = [];
  for (const q of QUERIES) {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&from=${from}&sortby=publishedAt&apikey=${key}`;
    const res = await fetchRetry(url);
    if (!res.ok) throw new Error(`GNews HTTP ${res.status}`);
    const j = (await res.json()) as { articles?: { title: string; url: string; publishedAt: string; source: { name: string } }[] };
    for (const a of j.articles ?? []) all.push({ title: a.title, source: a.source?.name ?? "GNews", publishedAt: a.publishedAt, url: a.url });
  }
  if (!all.length) throw new Error("GNews returned no articles");
  return all;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

async function fromRss(): Promise<Headline[]> {
  const all: Headline[] = [];
  for (const q of QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${NEWS.lookbackDays}d`)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetchRetry(url);
    if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const item = m[1];
      const tag = (t: string) => decode(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(item)?.[1] ?? "");
      const rawTitle = tag("title");
      const source = tag("source") || rawTitle.split(" - ").pop() || "Google News";
      const title = rawTitle.replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
      const pub = tag("pubDate");
      all.push({ title, source, url: tag("link"), publishedAt: pub ? new Date(pub).toISOString() : null });
    }
  }
  if (!all.length) throw new Error("Google News RSS returned no items");
  return all;
}

/** GNews first; if it fails, is rate-limited or has no key, automatically use the Google News RSS feed. */
export async function fetchHeadlines(): Promise<NewsResult> {
  const key = optionalEnv("GNEWS_API_KEY");
  let gnewsProblem = "no GNews key is set";
  if (key) {
    try {
      const headlines = dedupeAndTrim(await fromGNews(key));
      if (headlines.length) return { source: "gnews", headlines, note: "Headlines from GNews." };
      gnewsProblem = "GNews had no recent headlines";
    } catch (e) {
      gnewsProblem = (e as Error).message;
    }
  }
  try {
    const headlines = dedupeAndTrim(await fromRss());
    return { source: "google_news_rss", headlines, note: `Headlines from Google News (backup source), because ${gnewsProblem}.` };
  } catch (e) {
    return { source: "none", headlines: [], note: `News could not be loaded this week (${gnewsProblem}; ${(e as Error).message}).` };
  }
}
