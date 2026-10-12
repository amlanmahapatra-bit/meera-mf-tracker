import { fmtPct, fmtPoints, toneClass } from "@/lib/format";
import type { FundComparison, WindowValues } from "@/lib/comparison";
import Term from "./Term";

const COLS: { key: keyof WindowValues; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "Last month" },
  { key: "ytd", label: "Year so far" },
];

function Gap({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-3">{"—"}</span>;
  if (Math.abs(v) < 0.15) return <span className="font-semibold text-ink-2">In line</span>;
  return <span className={`font-semibold ${toneClass(v)}`}>{fmtPoints(v)} {v > 0 ? "ahead" : "behind"}</span>;
}

/** The full numbers behind the card: the fund, what it is compared with, and the gaps, for all three periods. */
export default function ComparisonTable({ c }: { c: FundComparison }) {
  const rows: { label: React.ReactNode; vals: WindowValues; kind: "pct" | "gap"; strong?: boolean }[] = [
    { label: "This fund", vals: c.fund, kind: "pct", strong: true },
  ];
  if (c.benchmarkName && c.benchmark && c.gapVsBenchmark) {
    rows.push({ label: <>The <Term k="index">{c.benchmarkName}</Term></>, vals: c.benchmark, kind: "pct" });
    rows.push({ label: "Fund versus the index", vals: c.gapVsBenchmark, kind: "gap" });
  }
  if (c.peersRequested > 0) {
    rows.push({ label: <>Average of {c.peersUsed} <Term k="similar">similar funds</Term></>, vals: c.category, kind: "pct" });
    rows.push({ label: "Fund versus similar funds", vals: c.gapVsCategory, kind: "gap" });
  }
  return (
    <div className="themed overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
      <table className="w-full min-w-[480px] text-left text-sm">
        <caption className="sr-only">How the fund compares over three periods</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <th scope="col" className="px-4 py-3 font-semibold" />
            {COLS.map((col) => <th key={col.key} scope="col" className="px-4 py-3 text-right font-semibold">{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-line last:border-0 ${r.kind === "gap" ? "bg-card-2" : ""}`}>
              <th scope="row" className={`px-4 py-3 text-left ${r.strong ? "font-bold text-ink" : "font-medium text-ink-2"}`}>{r.label}</th>
              {COLS.map((col) => (
                <td key={col.key} className="px-4 py-3 text-right tabular-nums">
                  {r.kind === "pct" ? <span className={`${r.strong ? "font-bold" : "font-medium"} ${toneClass(r.vals[col.key])}`}>{fmtPct(r.vals[col.key])}</span> : <Gap v={r.vals[col.key]} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!c.benchmarkName && <p className="border-t border-line px-4 py-3 text-xs text-ink-3">There is no free market index for this kind of fund, so it is compared with similar funds only.</p>}
      {c.benchmarkMissing && <p className="border-t border-line px-4 py-3 text-xs text-warn">The {c.benchmarkName} could not be loaded this time, so only similar funds are used.</p>}
    </div>
  );
}
