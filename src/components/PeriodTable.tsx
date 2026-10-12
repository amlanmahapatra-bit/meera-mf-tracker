import { fmtDate, fmtPct, toneClass } from "@/lib/format";
import type { PeriodSummary } from "@/lib/periods";

/** "How it did over time": every period from 1 day to 5 years, plus since the fund started. Too-young periods say so plainly. */
export default function PeriodTable({ summary }: { summary: PeriodSummary }) {
  const yearsText = summary.years >= 1 ? `${summary.years.toFixed(1)} years` : `${Math.max(1, Math.round(summary.years * 12))} months`;
  return (
    <div className="themed overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
      <table className="w-full min-w-[460px] text-left text-sm">
        <caption className="sr-only">How the fund did over different periods</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <th scope="col" className="px-4 py-3 font-semibold">Over the last</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">It changed by</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">On average each year</th>
            <th scope="col" className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Compared with</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              <th scope="row" className="px-4 py-3 font-semibold text-ink">{r.label}</th>
              {r.pct === null ? (
                <td colSpan={3} className="px-4 py-3 text-right text-ink-3">Not enough history yet (this fund is {yearsText} old)</td>
              ) : (
                <>
                  <td className={`px-4 py-3 text-right text-base font-bold tabular-nums ${toneClass(r.pct)}`}>{fmtPct(r.pct)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.perYear === null ? "text-ink-3" : `font-semibold ${toneClass(r.perYear)}`}`}>{r.perYear === null ? "—" : fmtPct(r.perYear)}</td>
                  <td className="hidden px-4 py-3 text-right text-ink-3 sm:table-cell">{fmtDate(r.baseDate)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-xs text-ink-3">
        Prices go back to {fmtDate(summary.firstDate)}. &ldquo;1 day&rdquo; compares with the previous trading day, because prices are set once a day.
      </p>
    </div>
  );
}
