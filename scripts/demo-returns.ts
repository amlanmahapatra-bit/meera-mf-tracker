/** Runs the returns engine on REAL data so you can eyeball the numbers. Run: npm run demo:returns */
import { averagePeerReturns, computeReturns, seriesFromMfapi, type Point, type Returns } from "../src/lib/returns";

const FUNDS: [number, string, number[]][] = [
  [118482, "Large Cap  | Bandhan Nifty 50", [118741, 118881]],
  [147622, "Mid Cap    | Motilal Midcap 150", [148726, 148807, 149389]],
  [147623, "Small Cap  | Motilal Smallcap 250", [148519, 149283, 150677]],
  [119016, "Debt       | HDFC Short Term", [120754, 119816, 120510, 149587]],
  [150751, "Intl       | Axis Nasdaq 100 FoF", []],
];

async function nav(code: number): Promise<Point[]> {
  const res = await fetch(`https://api.mfapi.in/mf/${code}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`mfapi ${code}: HTTP ${res.status}`);
  return seriesFromMfapi(((await res.json()) as { data: { date: string; nav: string }[] }).data);
}

async function yahoo(symbol: string): Promise<Point[]> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json()) as { chart: { result: { timestamp: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] } };
  const r = j.chart.result[0];
  return r.timestamp.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: r.indicators.quote[0].close[i] ?? NaN }));
}

const f = (n: number | null | undefined) => (n == null ? "  n/a " : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`.padStart(8));
const row = (r: Returns | null) => (r ? `${f(r.week?.pct)} ${f(r.month?.pct)} ${f(r.ytd?.pct)}` : "   n/a    n/a    n/a");

async function main() {
  console.log("Fund / index                         Week     Month     YTD     (as of)");
  const nifty = computeReturns(await yahoo("^NSEI"));
  console.log(`Index      | Nifty 50                 ${row(nifty)}   ${nifty?.asOf}`);
  for (const [code, label, peers] of FUNDS) {
    const r = computeReturns(await nav(code));
    console.log(`${label.padEnd(36)} ${row(r)}   ${r?.asOf}`);
    if (peers.length) {
      const results = await Promise.all(peers.map((p) => nav(p).then((s) => computeReturns(s)).catch(() => null)));
      const a = averagePeerReturns(results);
      console.log(`   peer average (${a.peersUsed} of ${a.peersRequested} funds)      ${f(a.week)} ${f(a.month)} ${f(a.ytd)}`);
    } else console.log("   peer average: no peers set yet");
  }
  // Show the exact base dates/values behind one fund so it can be checked by hand.
  const one = computeReturns(await nav(118482))!;
  console.log("\nHand-check, Bandhan Nifty 50:");
  console.log(`  latest NAV ${one.latestValue} on ${one.asOf}`);
  for (const w of ["week", "month", "ytd"] as const) {
    const x = one[w];
    if (x) console.log(`  ${w}: base NAV ${x.baseValue} on ${x.baseDate} -> (${one.latestValue}/${x.baseValue} - 1) = ${x.pct.toFixed(4)}%`);
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
