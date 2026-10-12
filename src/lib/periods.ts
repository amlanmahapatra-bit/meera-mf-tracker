/**
 * "How did it do over time?": 1 day, 1 week, 1 month, 6 months, 1 year, 3 years, 5 years and since the fund started.
 * Pure code on the fund's own price history (no network). A period the fund is too young for is reported as
 * unavailable, never guessed.
 */
import { addDays, cleanSeries, daysBetween, MAX_FALLBACK_DAYS, monthsBefore, onOrBefore, type Point } from "./returns";

export type PeriodKey = "1d" | "1w" | "1m" | "6m" | "1y" | "3y" | "5y" | "all";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1d", label: "1 day" },
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "6m", label: "6 months" },
  { key: "1y", label: "1 year" },
  { key: "3y", label: "3 years" },
  { key: "5y", label: "5 years" },
  { key: "all", label: "Since the fund started" },
];

export type PeriodReturn = {
  key: PeriodKey;
  label: string;
  /** Total change over the period, in percent. null when the fund is too young. */
  pct: number | null;
  /** For periods of a year or more: the average change per year (compound), in percent. */
  perYear: number | null;
  baseDate: string | null;
};

export type PeriodSummary = {
  asOf: string;
  firstDate: string;
  /** How many years of history the fund has. */
  years: number;
  rows: PeriodReturn[];
};

const DAYS_PER_YEAR = 365.25;

function targetFor(key: PeriodKey, latest: string): string | null {
  switch (key) {
    case "1w": return addDays(latest, -7);
    case "1m": return monthsBefore(latest, 1);
    case "6m": return monthsBefore(latest, 6);
    case "1y": return monthsBefore(latest, 12);
    case "3y": return monthsBefore(latest, 36);
    case "5y": return monthsBefore(latest, 60);
    default: return null;
  }
}

export function periodReturns(raw: Point[]): PeriodSummary | null {
  const series = cleanSeries(raw);
  if (series.length < 2) return null;
  const latest = series[series.length - 1];
  const first = series[0];

  const rows: PeriodReturn[] = PERIODS.map(({ key, label }) => {
    let base: Point | null = null;
    if (key === "1d") base = series[series.length - 2]; // the previous trading day
    else if (key === "all") base = first;
    else {
      const target = targetFor(key, latest.date)!;
      const found = onOrBefore(series, target);
      // The fund must really have a price near the start of the period, else it is too young.
      base = found && daysBetween(found.date, target) <= MAX_FALLBACK_DAYS ? found : null;
    }
    if (!base || base.date >= latest.date) return { key, label, pct: null, perYear: null, baseDate: null };

    const pct = (latest.value / base.value - 1) * 100;
    const years = daysBetween(base.date, latest.date) / DAYS_PER_YEAR;
    const perYear = years >= 0.99 ? ((latest.value / base.value) ** (1 / years) - 1) * 100 : null;
    return { key, label, pct, perYear, baseDate: base.date };
  });

  return { asOf: latest.date, firstDate: first.date, years: daysBetween(first.date, latest.date) / DAYS_PER_YEAR, rows };
}
