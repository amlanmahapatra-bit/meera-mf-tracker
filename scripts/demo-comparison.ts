/** Step 4 on REAL data: benchmark + category comparison for all five funds. Run: npm run demo:comparison */
import { compareFund, convertToInr, matchedReturns, peerAverageMatched } from "../src/lib/comparison";
import { BENCHMARKS, USDINR_SYMBOL } from "../src/lib/config";
import { computeReturns, type Point } from "../src/lib/returns";
import { fetchIndexSeries } from "../src/lib/sources/indices";
import { fetchScheme } from "../src/lib/sources/mfapi";

const FUNDS = [
  { code: 118482, label: "Large Cap", bench: "Nifty 50", peers: [118741, 118881] },
  { code: 147622, label: "Mid Cap", bench: "Nifty Midcap 150", peers: [148726, 148807, 149389, 150673, 151724, 152855, 153089, 153401, 153581] },
  { code: 147623, label: "Small Cap", bench: "Nifty Smallcap 250", peers: [148519, 149283, 150677, 150892, 151727, 152264, 152431, 153223, 154018] },
  { code: 119016, label: "Debt", bench: null, peers: [120754, 119816, 120510, 149587] },
  { code: 150751, label: "International", bench: "Nasdaq 100", peers: [149219, 149961, 148381, 119252, 148760] },
];
const f = (n: number | null) => (n == null ? "  n/a " : `${n >= 0 ? "+" : ""}${n.toFixed(2)}`.padStart(7));
const row = (v: { week: number | null; month: number | null; ytd: number | null } | null) => (v ? `${f(v.week)} ${f(v.month)} ${f(v.ytd)}` : "    n/a     n/a     n/a");

async function main() {
  const fx = await fetchIndexSeries(USDINR_SYMBOL);
  console.log("Columns: week / month / year-to-date, in % (gaps in percentage points)\n");
  for (const fd of FUNDS) {
    const scheme = await fetchScheme(fd.code);
    const fr = computeReturns(scheme.series)!;
    let br = null;
    if (fd.bench) {
      const cfg = BENCHMARKS[fd.bench];
      let s = await fetchIndexSeries(cfg.symbol);
      if (cfg.currency === "USD") s = convertToInr(s, fx, cfg.lagDays);
      br = matchedReturns(s, fr, cfg.lagDays);
    }
    const peerSeries = await Promise.all(fd.peers.map((p) => fetchScheme(p).then((x) => x.series).catch(() => null as Point[] | null)));
    const c = compareFund({ fundReturns: fr, benchmarkName: fd.bench, benchmarkReturns: br, peers: peerAverageMatched(peerSeries, fr) });
    console.log(`${fd.label} (as of ${c.asOf})`);
    console.log(`  fund               ${row(c.fund)}`);
    console.log(`  ${(fd.bench ?? "no benchmark").padEnd(18)} ${row(c.benchmark)}`);
    console.log(`  gap vs benchmark   ${row(c.gapVsBenchmark)}`);
    console.log(`  similar funds avg  ${row(c.category)}   (${c.peersUsed} of ${c.peersRequested} funds)`);
    console.log(`  gap vs similar     ${row(c.gapVsCategory)}`);
    if (c.split) console.log(`  this week: ${f(c.split.total)}% = market ${f(c.split.marketPart)}% + fund ${f(c.split.fundPart)}%`);
    console.log();
  }

  // Why we convert to rupees and shift by a day for the Nasdaq fund: try the options on real data.
  const axis = computeReturns((await fetchScheme(150751)).series)!;
  const ndx = await fetchIndexSeries("^NDX");
  const ndxInr = convertToInr(ndx, fx, 1);
  console.log("Nasdaq fund check (fund's own 1-week return vs the index, 3 ways):");
  console.log(`  fund:                                  ${f(axis.week!.pct)}%`);
  console.log(`  index in dollars, no lag (wrong):      ${f(matchedReturns(ndx, axis, 0)!.week!.pct)}%`);
  console.log(`  index in rupees, no lag:               ${f(matchedReturns(ndxInr, axis, 0)!.week!.pct)}%`);
  console.log(`  index in rupees, 1-day lag (used):     ${f(matchedReturns(ndxInr, axis, 1)!.week!.pct)}%`);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
