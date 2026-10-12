import { getJson } from "../http";
import { cleanSeries, type Point } from "../returns";

type YahooChart = {
  chart?: {
    result?: { meta?: { gmtoffset?: number }; timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[];
    error?: { description?: string } | null;
  };
};

/**
 * Daily closes for an index (or currency pair) from the Yahoo Finance chart API.
 * Throws if the symbol has no data. Yahoo is unofficial, so callers must be ready to fall back
 * to the closes we cached in the database (see pipeline/load.ts).
 */
export async function fetchIndexSeries(symbol: string, range = "2y"): Promise<Point[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const j = await getJson<YahooChart>(url);
  const r = j.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`No data for ${symbol}: ${j.chart?.error?.description ?? "empty response"}`);
  const closes = r.indicators.quote[0].close;
  // Label each day in the market's own time zone. (Currency rows are stamped 23:00 UTC the evening
  // before, which is midnight London time; reading them in UTC would date every row one day early.)
  const offset = r.meta?.gmtoffset ?? 0;
  const series = cleanSeries(
    r.timestamp.map((t, i) => ({ date: new Date((t + offset) * 1000).toISOString().slice(0, 10), value: closes[i] ?? NaN })),
  );
  if (series.length < 20) throw new Error(`Too little history for ${symbol} (${series.length} closes)`);
  return series;
}
