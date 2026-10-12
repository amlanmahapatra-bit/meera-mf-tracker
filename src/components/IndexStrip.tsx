import { fmtPct, moveWord, toneClass } from "@/lib/format";
import type { IndexMove } from "@/lib/report-types";
import { SMALLCAP_NOTICE } from "@/lib/notices";
import Term from "./Term";

/** How the markets themselves did this week (the "whole market" the funds are measured against). */
export default function IndexStrip({ moves }: { moves: IndexMove[] }) {
  return (
    <section aria-labelledby="market-title">
      <h2 id="market-title" className="text-lg font-bold tracking-tight">How the markets did this week</h2>
      <p className="mt-1 text-sm text-ink-2">A <Term k="index">market index</Term> is a score for a whole part of the market.</p>
      <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {moves.map((m) => (
          <li key={m.name} className="themed rounded-xl border border-line bg-card p-4">
            <p className="text-xs font-semibold text-ink-3">{m.name}</p>
            <p className={`mt-1 text-2xl font-extrabold tabular-nums ${toneClass(m.week)}`}>{fmtPct(m.week)}</p>
            <p className="text-xs text-ink-3">{moveWord(m.week)} this week{m.name === "Nasdaq 100" ? " (in US dollars)" : ""}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-xs text-ink-2">{SMALLCAP_NOTICE}</p>
    </section>
  );
}
