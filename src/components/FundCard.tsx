import Link from "next/link";
import { fmtDate, fmtNav, fmtPct, toneClass } from "@/lib/format";
import { comparisonRows } from "@/lib/present";
import { shortName } from "@/lib/present";
import type { FundReport } from "@/lib/report-types";
import type { Point } from "@/lib/returns";
import { peerStanding } from "@/lib/status";
import Sparkline from "./Sparkline";
import SplitBar from "./SplitBar";
import StandingLabel from "./StandingLabel";
import StatusChip from "./StatusChip";
import Term from "./Term";

const TONE_CLASS = { good: "text-good", bad: "text-bad", flat: "text-ink-2", na: "text-ink-3" } as const;

function Stat({ label, value, help }: { label: React.ReactNode; value: number | null; help?: boolean }) {
  return (
    <div className="rounded-xl bg-card-2 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${toneClass(value)}`} aria-label={help ? undefined : undefined}>{fmtPct(value)}</p>
    </div>
  );
}

/** One fund: traffic light, name (click for details), price, returns, how it compares, the week's split, and the written summary. */
export default function FundCard({ fund, prices }: { fund: FundReport; prices: Point[] }) {
  const c = fund.comparison;
  const standing = peerStanding(c.gapVsCategory.month, c.peersUsed);
  const rows = comparisonRows(c);
  const spark = prices.slice(-130);
  return (
    <article className="themed relative rounded-2xl border border-line bg-card p-5 shadow-card transition-colors hover:border-line-strong sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{fund.slot}</p>
        <StatusChip status={fund.status} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xl font-extrabold leading-snug tracking-tight">
          <Link href={`/funds/${fund.schemeCode}`} className="stretched hover:underline decoration-2 underline-offset-4">{shortName(fund.name)}</Link>
        </h3>
        <StandingLabel standing={standing} />
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-ink-3"><Term k="nav">Price (NAV)</Term> as of {fmtDate(fund.asOf, false)}</p>
              <p className="text-3xl font-extrabold tabular-nums tracking-tight">{fmtNav(fund.nav)}</p>
            </div>
            <Sparkline points={spark} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="This week" value={c.fund.week} />
            <Stat label="Last month" value={c.fund.month} />
            <Stat label={<Term k="ytd">Year so far</Term>} value={c.fund.ytd} />
          </div>

          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Over the last month</p>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-ink-2">
                  Compared with {r.help ? <Term k={r.help}>{r.label}</Term> : r.label}
                </span>
                <span className={`font-semibold ${TONE_CLASS[r.phrase.tone]}`}>{r.phrase.text}</span>
              </li>
            ))}
            {!c.benchmarkName && <li className="text-xs text-ink-3">No market index exists for this kind of fund, so it is compared with similar funds only.</li>}
          </ul>
        </div>

        <div className="space-y-4">
          {c.split && <SplitBar split={c.split} />}
          <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">
            {fund.sentences.map((s, i) => <p key={i}>{s}</p>)}
          </div>
        </div>
      </div>

      {fund.dataNotes.length > 0 && (
        <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{fund.dataNotes.join(" ")}</p>
      )}
      <p className="mt-4 text-sm font-semibold text-accent">See details and price history <span aria-hidden="true">&rarr;</span></p>
    </article>
  );
}
