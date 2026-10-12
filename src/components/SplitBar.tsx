import { fmtPct } from "@/lib/format";
import type { Split } from "@/lib/comparison";
import Term from "./Term";

/**
 * "Market or fund?" for this week's move: one bar split into the part the whole market explains and the part that is
 * the fund's own. Widths follow the size of each part; a 2px gap keeps the two segments apart.
 */
export default function SplitBar({ split }: { split: Split }) {
  const m = Math.abs(split.marketPart);
  const f = Math.abs(split.fundPart);
  const total = m + f;
  const marketPct = total < 0.005 ? 100 : Math.max(2, (m / total) * 100);
  const word = split.total >= 0 ? "rise" : "drop";
  return (
    <div>
      <p className="text-sm text-ink-2">
        <Term k="split">Market or fund?</Term>{" "}
        Of this week&apos;s {fmtPct(Math.abs(split.total), { sign: false })} {word}:{" "}
        <strong className="font-semibold text-ink">{fmtPct(Math.abs(split.marketPart), { sign: false })}</strong> was the whole market,{" "}
        <strong className="font-semibold text-ink">{fmtPct(Math.abs(split.fundPart), { sign: false })}</strong> was this fund.
      </p>
      <div className="mt-2 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Whole market ${fmtPct(Math.abs(split.marketPart), { sign: false })}, this fund ${fmtPct(Math.abs(split.fundPart), { sign: false })}`}>
        <div style={{ width: `${marketPct}%`, background: "var(--line-strong)" }} className="rounded-l-full" />
        {marketPct < 100 && <div style={{ width: `${100 - marketPct}%`, background: "var(--accent)" }} className="rounded-r-full" />}
      </div>
      <div className="mt-1.5 flex gap-4 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--line-strong)" }} />Whole market</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />This fund</span>
      </div>
    </div>
  );
}
