import { shortName } from "@/lib/present";
import type { FundReport } from "@/lib/report-types";
import type { SnapshotPoint } from "@/lib/queries";
import LineChart, { type ChartSeries } from "./LineChart";

const RANGES = [{ label: "1Y", days: 365 }, { label: "3Y", days: 1096 }, { label: "5Y", days: 1826 }, { label: "All", days: null }];
const SLOT_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

/** Week by week: how each fund did over the month leading up to that Saturday. One colour per fund, fixed by its position. */
export default function TrendSection({ funds, snapshots }: { funds: FundReport[]; snapshots: SnapshotPoint[] }) {
  const series: ChartSeries[] = funds.slice(0, 5).map((f, i) => ({
    id: String(f.schemeCode),
    label: f.slot,
    color: SLOT_COLORS[i],
    points: snapshots.filter((s) => s.schemeCode === f.schemeCode && s.month !== null).map((s) => ({ date: s.weekEnding, value: s.month as number })),
  }));
  const weeks = new Set(snapshots.map((s) => s.weekEnding)).size;
  return (
    <section aria-labelledby="trend-title">
      <h2 id="trend-title" className="text-lg font-bold tracking-tight">How your funds are trending</h2>
      <p className="mt-1 text-sm text-ink-2">Each point is how a fund did over the month up to that Saturday, built from the real prices. {weeks} week{weeks === 1 ? "" : "s"} of history so far; a new point is added every Saturday.</p>
      <div className="themed mt-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
        <LineChart
          series={series}
          unit="percent-whole"
          ariaLabel="Chart of each fund's monthly return, week by week"
          height={260}
          zeroLine
          ranges={RANGES}
          defaultRange="1Y"
        />
        {weeks < 2 && (
          <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-xs text-ink-2">
            The lines appear once two or more weeks are saved. A new point is added every Saturday morning.
          </p>
        )}
      </div>
      <p className="sr-only">{funds.map((f) => shortName(f.name)).join(", ")}</p>
    </section>
  );
}
