import Link from "next/link";
import { BENCHMARKS } from "@/lib/config";
import { fmtDate, fmtNav, fmtPct, toneClass } from "@/lib/format";
import { comparisonRows, latestPrice, shortName } from "@/lib/present";
import type { FundReport } from "@/lib/report-types";
import type { Point } from "@/lib/returns";
import { peerStanding } from "@/lib/status";
import Sparkline from "./Sparkline";
import SplitBar from "./SplitBar";
import StandingLabel from "./StandingLabel";
import StatusChip from "./StatusChip";
import Term from "./Term";

const TONE_CLASS = { good: "text-good", bad: "text-bad", flat: "text-ink-2", na: "text-ink-3" } as const;

function Stat({ label, value }: { label: React.ReactNode; value: number | null }) {
  return (
    <div className="rounded-xl bg-card-2 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${toneClass(value)}`}>{fmtPct(value)}</p>
    </div>
  );
}

/**
 * One fund. The main thing is the three plain lines about it ("In plain words"); the price, numbers and comparisons
 * sit underneath as supporting detail. The name is the click target for the full page.
 */
export default function FundCard({ fund, prices }: { fund: FundReport; prices: Point[] }) {
  const c = fund.comparison;
  const standing = peerStanding(c.gapVsCategory.month, c.peersUsed);
  const rows = comparisonRows(c);
  const spark = prices.slice(-130);
  const latest = latestPrice(prices, fund.nav, fund.asOf);
  const looseTracking = c.benchmarkName ? BENCHMARKS[c.benchmarkName]?.trackingAllowance ?? 0 : 0;
  return (
    <article className="themed relative rounded-2xl border border-line bg-card p-5 shadow-card transition-colors hover:border-line-strong sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{fund.slot}</p>
        <StatusChip status={fund.status} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xl font-extrabold leading-snug tracking-tight">
          <Link href={`/funds/${fund.schemeCode}`} className="stretched decoration-2 underline-offset-4 hover:underline">{shortName(fund.name)}</Link>
        </h3>
        <StandingLabel standing={standing} />
      </div>

      {/* The result, in very simple words: the star of the card */}
      <div className="mt-4 rounded-xl border-l-4 border-accent bg-accent-soft/50 px-4 py-3.5">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">In plain words</p>
        <ol className="mt-2 space-y-2 text-[17px] leading-relaxed text-ink">
          {fund.sentences.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>

      {/* Supporting numbers */}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-ink-3"><Term k="nav">Price (NAV)</Term> as of {fmtDate(latest?.date ?? fund.asOf, false)}{latest ? " (latest)" : ""}</p>
              <p className="text-2xl font-extrabold tabular-nums tracking-tight">{fmtNav(latest?.nav ?? fund.nav)}</p>
              {latest && latest.sinceReportPct !== null && (
                <p className="text-xs text-ink-3">
                  <span className={`font-semibold ${toneClass(latest.sinceReportPct)}`}>{fmtPct(latest.sinceReportPct)}</span> since the check-up on {fmtDate(fund.asOf, false)}
                </p>
              )}
            </div>
            <Sparkline points={spark} />
          </div>
          <p className="mt-3 text-[11px] text-ink-3">Check-up figures as of {fmtDate(fund.asOf, false)} (refreshed every Saturday)</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <Stat label="This week" value={c.fund.week} />
            <Stat label="Last month" value={c.fund.month} />
            <Stat label={<Term k="ytd">Year so far</Term>} value={c.fund.ytd} />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Over the last month, compared with</p>
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-ink-2">{r.help ? <Term k={r.help}>{r.label}</Term> : r.label}</span>
                  <span className={`font-semibold ${TONE_CLASS[r.phrase.tone]}`}>{r.phrase.text}</span>
                </li>
              ))}
              {!c.benchmarkName && <li className="text-xs text-ink-3">There is no market score for this kind of fund, so it is compared with similar funds only.</li>}
              {looseTracking > 0 && <li className="text-xs text-ink-3">This fund follows its market score loosely (it is priced at a different time of day), so gaps of up to {looseTracking}% are normal and do not change its traffic light.</li>}
            </ul>
          </div>
          {c.split && <SplitBar split={c.split} />}
        </div>
      </div>

      {fund.dataNotes.length > 0 && <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{fund.dataNotes.join(" ")}</p>}
      <p className="mt-4 text-sm font-semibold text-accent">See its full history <span aria-hidden="true">&rarr;</span></p>
    </article>
  );
}
