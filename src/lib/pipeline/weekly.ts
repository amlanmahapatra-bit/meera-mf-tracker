import { addDays, computeReturns, type Point } from "../returns";
import { alignedReturns, compareFund, convertToInr, matchedReturns, peerAverageMatched } from "../comparison";
import { BENCHMARKS, MARKET_CONTEXT_INDEXES, USDINR_SYMBOL } from "../config";
import { istToday, weekEndingFor } from "../dates";
import { getActiveFunds, previousSnapshot, recentStatuses, upsertReport, upsertSnapshots, type SnapshotRow } from "../db";
import { SMALLCAP_NOTICE } from "../notices";
import { writeReport } from "../report-writer";
import type { FundReport, IndexMove, ReportInput, ReportJson } from "../report-types";
import { fetchHeadlines } from "../sources/news";
import { candidateVerdict, fundStatus, nextWeeksLagging } from "../status";
import { loadFundNav, loadIndex, loadPeerSeries, type Loaded } from "./load";
import type { JobOutcome } from "./run";

/**
 * The Saturday-morning job. Stages: fetch -> store -> compute -> context -> write -> validate -> store.
 * Re-running for the same week updates that week's rows instead of adding new ones.
 */
export async function runWeekly(opts: { weekEnding?: string } = {}): Promise<JobOutcome> {
  const weekEnding = opts.weekEnding ?? weekEndingFor(istToday());
  const notes: string[] = [];
  const failures: string[] = [];

  const funds = await getActiveFunds();
  if (funds.length === 0) throw new Error("There are no active funds to report on.");

  // --- Index data (loaded once, shared by every fund that needs it) ---
  const indexCache = new Map<string, Promise<Loaded | null>>();
  const getIndex = (symbol: string, label: string) => {
    if (!indexCache.has(symbol)) {
      indexCache.set(symbol, loadIndex(symbol, label).then((r) => { if (r.note) notes.push(r.note); return r; }).catch((e) => { failures.push(`${label}: ${(e as Error).message}`); return null; }));
    }
    return indexCache.get(symbol)!;
  };
  const fx = await getIndex(USDINR_SYMBOL, "US dollar to rupee rate");

  // --- Per-fund numbers ---
  const reportFunds: Omit<FundReport, "sentences">[] = [];
  const recent: ReportInput["recentStatuses"] = {};
  const snapshotDrafts: Omit<SnapshotRow, "summary">[] = [];

  for (const f of funds) {
    let nav: Loaded;
    try {
      nav = await loadFundNav(f.scheme_code);
    } catch (e) {
      failures.push(`${f.name}: ${(e as Error).message}`);
      continue;
    }
    const dataNotes: string[] = nav.note ? [nav.note] : [];
    const fundReturns = computeReturns(nav.series, weekEnding);
    if (!fundReturns) {
      failures.push(`${f.name}: no price on or before ${weekEnding}`);
      continue;
    }

    // Benchmark on the fund's own dates (converted to rupees for the Nasdaq).
    let benchReturns = null;
    const cfg = f.benchmark_name ? BENCHMARKS[f.benchmark_name] : undefined;
    if (f.benchmark_name && !cfg) dataNotes.push(`No data source is set up for "${f.benchmark_name}".`);
    if (cfg) {
      const idx = await getIndex(cfg.symbol, f.benchmark_name!);
      let series: Point[] | null = idx?.series ?? null;
      if (series && cfg.currency === "USD") series = fx ? convertToInr(series, fx.series, cfg.lagDays) : null;
      if (series) benchReturns = matchedReturns(series, fundReturns, cfg.lagDays);
      if (idx?.note) dataNotes.push(idx.note);
      if (!benchReturns) dataNotes.push(`${f.benchmark_name} data could not be matched to this fund's dates.`);
    }

    // Category average from peers.
    const peers = peerAverageMatched(await loadPeerSeries(f.peer_codes), fundReturns);
    if (peers.peersUsed < peers.peersRequested) dataNotes.push(`${peers.peersRequested - peers.peersUsed} of ${peers.peersRequested} similar funds could not be loaded and were skipped.`);

    const comparison = compareFund({ fundReturns, benchmarkName: f.benchmark_name, benchmarkReturns: benchReturns, peers });

    // Status: streak continues only from the immediately preceding week's snapshot.
    const prev = await previousSnapshot(f.scheme_code, weekEnding);
    const prevStreak = prev && prev.week_ending >= addDays(weekEnding, -10) ? prev.weeks_lagging : 0;
    const weeksLagging = nextWeeksLagging(prevStreak, comparison.gapVsReference.week);
    const status = fundStatus(comparison.gapVsReference.month, weeksLagging);
    const referenceLabel = comparison.reference === "benchmark" ? `the ${f.benchmark_name}` : "similar funds";

    recent[f.scheme_code] = await recentStatuses(f.scheme_code, weekEnding);
    dataNotes.forEach((n) => notes.push(`${f.slot}: ${n}`));
    reportFunds.push({
      schemeCode: f.scheme_code, name: f.name, slot: f.slot, status, weeksLagging,
      nav: fundReturns.latestValue, asOf: fundReturns.asOf, comparison, referenceLabel, dataNotes,
    });
    snapshotDrafts.push({
      week_ending: weekEnding, scheme_code: f.scheme_code, nav: fundReturns.latestValue,
      ret_1w: comparison.fund.week, ret_1m: comparison.fund.month, ret_ytd: comparison.fund.ytd,
      bench_ret_1w: comparison.benchmark?.week ?? null, bench_ret_1m: comparison.benchmark?.month ?? null, bench_ret_ytd: comparison.benchmark?.ytd ?? null,
      cat_avg_1w: comparison.category.week, cat_avg_1m: comparison.category.month, cat_avg_ytd: comparison.category.ytd,
      market_part_1w: comparison.split?.marketPart ?? null, fund_part_1w: comparison.split?.fundPart ?? null,
      status, weeks_lagging: weeksLagging,
    });
  }
  if (reportFunds.length === 0) throw new Error(`No fund could be analysed. ${failures.join(" | ")}`);

  // --- Verdict (computed in code; the writer only explains it) ---
  const verdict = candidateVerdict(
    reportFunds.map((r) => ({ slot: r.slot, status: r.status, monthGap: r.comparison.gapVsReference.month, weeksLagging: r.weeksLagging, referenceLabel: r.referenceLabel })),
  );

  // --- Market context: index moves for the week + headlines ---
  const indexMoves: IndexMove[] = [];
  for (const m of MARKET_CONTEXT_INDEXES) {
    const idx = await getIndex(m.symbol, m.name);
    const r = idx ? alignedReturns(idx.series, weekEnding) : null;
    indexMoves.push({ name: m.name, week: r?.week?.pct ?? null, month: r?.month?.pct ?? null, ytd: r?.ytd?.pct ?? null, asOf: r?.asOf ?? null });
  }
  const news = await fetchHeadlines();
  if (news.source !== "gnews") notes.push(news.note);

  const input: ReportInput = {
    weekEnding, language: "en", verdict: verdict.verdict, verdictReason: verdict.reason, funds: reportFunds,
    marketContext: { indexMoves, news: { source: news.source, note: news.note, headlines: news.headlines }, notices: [SMALLCAP_NOTICE] },
    recentStatuses: recent,
  };

  // --- Write the words, then store everything ---
  const written = await writeReport(input);
  const report: ReportJson = {
    weekEnding, generatedAt: new Date().toISOString(), language: "en",
    verdict: written.verdict, verdictReason: written.verdictReason,
    funds: reportFunds.map((f) => ({ ...f, sentences: written.sentences[f.schemeCode] })),
    marketContext: input.marketContext, writer: written.writer,
  };
  if (written.writer.kind === "template" && written.writer.reason) notes.push(`Report text: ${written.writer.reason}`);

  await upsertSnapshots(snapshotDrafts.map((s) => ({ ...s, summary: written.sentences[s.scheme_code].join(" ") })));
  await upsertReport({
    week_ending: weekEnding, verdict: report.verdict, verdict_reason: report.verdictReason,
    market_context: report.marketContext as unknown as Record<string, unknown>, report_json: report as unknown as Record<string, unknown>,
  });

  return {
    status: failures.length || notes.length ? "partial" : "success",
    details: {
      weekEnding, fundsReported: reportFunds.length, fundsTotal: funds.length, verdict: report.verdict,
      newsSource: news.source, writer: written.writer.kind, notes, failures,
    },
  };
}
