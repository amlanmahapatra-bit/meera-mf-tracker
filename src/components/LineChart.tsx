"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtNav, fmtPct } from "@/lib/format";
import { addDays } from "@/lib/returns";

export type ChartSeries = { id: string; label: string; color: string; points: { date: string; value: number }[] };
/** days = look back this many days; points = show the last N prices; both null = everything. */
export type RangeOption = { label: string; days?: number | null; points?: number };

/** How values are written on the axis, in the tooltip and in the table. A name (not a function) so server pages can pass it. */
export type ChartUnit = "percent" | "percent-whole" | "price";
const FORMATTERS: Record<ChartUnit, (n: number) => string> = {
  percent: (n) => fmtPct(n),
  "percent-whole": (n) => fmtPct(n, { digits: 0 }),
  price: (n) => fmtNav(n),
};

type Props = {
  series: ChartSeries[];
  unit: ChartUnit;
  ariaLabel: string;
  height?: number;
  /** Optional range buttons (1M, 3M ...). days = null means "everything". */
  ranges?: RangeOption[];
  defaultRange?: string;
  /** Draw a faint line at zero (for charts of gains and losses). */
  zeroLine?: boolean;
  valueHeader?: string;
};

const MARGIN = { top: 12, right: 18, bottom: 26, left: 52 };
const DAY = 86_400_000;
const t = (iso: string) => Date.parse(iso + "T00:00:00Z");

/** 1-2-5 "nice" tick steps so the axis reads 0 / 5 / 10 and not 0 / 4.3 / 8.6. */
function niceTicks(lo: number, hi: number, want = 5): number[] {
  if (hi === lo) return [lo];
  const raw = (hi - lo) / want;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    setW(Math.max(280, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function LineChart({ series, unit, ariaLabel, height = 260, ranges, defaultRange, zeroLine, valueHeader = "Value" }: Props) {
  const format = FORMATTERS[unit];
  const [wrapRef, width] = useWidth();
  const [range, setRange] = useState(defaultRange ?? ranges?.[ranges.length - 1]?.label ?? "");
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // 1. Apply the chosen time range
  const visible = useMemo(() => {
    const opt = ranges?.find((r) => r.label === range);
    if (opt?.points) return series.map((s) => ({ ...s, points: s.points.slice(-opt.points!) }));
    if (!opt || opt.days === null || opt.days === undefined) return series;
    const last = series.flatMap((s) => s.points.map((p) => p.date)).sort().pop();
    if (!last) return series;
    const cutoff = addDays(last, -opt.days);
    return series.map((s) => ({ ...s, points: s.points.filter((p) => p.date >= cutoff) }));
  }, [series, ranges, range]);

  // A range is greyed out when the history does not reach back that far (for example 5Y for a 4-year-old fund).
  const historyDays = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => p.date)).sort();
    return all.length < 2 ? 0 : (t(all[all.length - 1]) - t(all[0])) / DAY;
  }, [series]);
  const tooYoung = (r: RangeOption) => !!r.days && historyDays < r.days * 0.97;

  const dates = useMemo(() => [...new Set(visible.flatMap((s) => s.points.map((p) => p.date)))].sort(), [visible]);
  const all = visible.flatMap((s) => s.points.map((p) => p.value));
  if (all.length === 0) return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-3">There is no history to draw yet.</p>;

  // 2. Scales
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const padY = (hi - lo || Math.abs(hi) || 1) * 0.08;
  lo -= padY; hi += padY;
  const ticks = niceTicks(lo, hi);
  const t0 = t(dates[0]), t1 = t(dates[dates.length - 1]);
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const X = (d: string) => MARGIN.left + (t1 === t0 ? innerW / 2 : ((t(d) - t0) / (t1 - t0)) * innerW);
  const Y = (v: number) => MARGIN.top + (1 - (v - lo) / (hi - lo)) * innerH;

  const spanDays = (t1 - t0) / DAY;
  // Axis labels: four evenly spaced dates, but only distinct ones (a 1-day view has just two dates), and with only a few
  // prices we label the prices themselves.
  const xTicks =
    dates.length <= 4
      ? dates
      : [...new Set([0, 1, 2, 3].map((i) => new Date(t0 + ((t1 - t0) * i) / 3).toISOString().slice(0, 10)))];
  const xLabel = (d: string) => (spanDays > 1100 ? d.slice(0, 4) : spanDays > 200 ? fmtDate(d).replace(/^\d+ /, "") : fmtDate(d, false));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + MARGIN.left;
    let best = dates[0], bestD = Infinity;
    for (const d of dates) {
      const dist = Math.abs(X(d) - px);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    setHoverDate(best);
  }

  const valueAt = (s: ChartSeries, d: string) => s.points.find((p) => p.date === d)?.value ?? null;
  const tipX = hoverDate ? Math.min(Math.max(X(hoverDate), 90), width - 90) : 0;
  const multi = visible.length > 1;

  // Table view: at most ~24 evenly spread rows so it stays readable
  const step = Math.max(1, Math.ceil(dates.length / 24));
  const tableDates = dates.filter((_, i) => i % step === 0 || i === dates.length - 1);

  return (
    <div>
      {(ranges || multi) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {multi ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
              {visible.map((s) => (
                <li key={s.id} className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-0.5 w-5 rounded" style={{ background: s.color, height: 2 }} />
                  {s.label}
                </li>
              ))}
            </ul>
          ) : <span />}
          {ranges && (
            <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-line bg-card-2 p-0.5">
              {ranges.map((r) => (
                <button key={r.label} type="button" onClick={() => setRange(r.label)} aria-pressed={range === r.label} disabled={tooYoung(r)}
                  title={tooYoung(r) ? "This fund is younger than that" : undefined}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${range === r.label ? "bg-card text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={wrapRef} className="relative" onPointerLeave={() => setHoverDate(null)}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block touch-pan-y select-none">
          {/* recessive hairline grid + y labels */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={MARGIN.left - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{format(v)}</text>
            </g>
          ))}
          {zeroLine && <line x1={MARGIN.left} x2={width - MARGIN.right} y1={Y(0)} y2={Y(0)} stroke="var(--line-strong)" strokeWidth="1" />}
          {xTicks.map((d, i) => (
            <text key={`${i}-${d}`} x={X(d)} y={height - 6} textAnchor={xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--ink-3)">{xLabel(d)}</text>
          ))}

          {/* series: 2px lines, soft wash under a single series, end dot with a surface ring */}
          {visible.map((s) => {
            if (s.points.length === 0) return null;
            const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.id}>
                {!multi && s.points.length > 1 && <path d={`${d} L${X(last.date)} ${Y(lo)} L${X(s.points[0].date)} ${Y(lo)} Z`} fill={s.color} opacity="0.1" />}
                {s.points.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                <circle cx={X(last.date)} cy={Y(last.value)} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />
              </g>
            );
          })}

          {/* hover: crosshair + a dot on every series at that date */}
          {hoverDate && (
            <g pointerEvents="none">
              <line x1={X(hoverDate)} x2={X(hoverDate)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke="var(--line-strong)" strokeWidth="1" />
              {visible.map((s) => {
                const v = valueAt(s, hoverDate);
                return v === null ? null : <circle key={s.id} cx={X(hoverDate)} cy={Y(v)} r="5" fill={s.color} stroke="var(--card)" strokeWidth="2" />;
              })}
            </g>
          )}
          <rect x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
        </svg>

        {hoverDate && (
          <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-card" style={{ left: tipX }} role="status">
            <div className="mb-1 font-semibold text-ink">{fmtDate(hoverDate)}</div>
            {visible.map((s) => {
              const v = valueAt(s, hoverDate);
              return v === null ? null : (
                <div key={s.id} className="flex items-center gap-2 text-ink-2">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {multi && <span>{s.label}</span>}
                  <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{format(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">Show as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card-2 text-ink-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                {visible.map((s) => <th key={s.id} scope="col" className="px-3 py-2 font-semibold">{multi ? s.label : valueHeader}</th>)}
              </tr>
            </thead>
            <tbody>
              {tableDates.map((d) => (
                <tr key={d} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-normal text-ink-2">{fmtDate(d)}</th>
                  {visible.map((s) => <td key={s.id} className="px-3 py-1.5 tabular-nums text-ink">{valueAt(s, d) === null ? "—" : format(valueAt(s, d)!)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
