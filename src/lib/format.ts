/** Number and date formatting for the screens. Plain, consistent, and safe with missing data. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUS = "−"; // a real minus sign, easier to read than a hyphen

/** "+0.4%" / "−3.9%" / "0.0%"; "—" when there is no number. */
export function fmtPct(n: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const digits = opts.digits ?? 1;
  const r = Number(n.toFixed(digits));
  const body = Math.abs(r).toFixed(digits);
  if (r === 0) return `${body}%`;
  const sign = r < 0 ? MINUS : opts.sign === false ? "" : "+";
  return `${sign}${body}%`;
}

/** "0.3 points" / "1.0 point" (gaps between two percentages are measured in points). */
export function fmtPoints(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n).toFixed(1);
  return `${a} point${a === "1.0" ? "" : "s"}`;
}

/** "₹50.461": the price per unit, up to 4 decimals, at least 2. */
export function fmtNav(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const fixed = n.toFixed(4).replace(/0+$/, "");
  const [whole, dec = ""] = fixed.split(".");
  return `₹${whole}.${dec.padEnd(2, "0")}`;
}

/** "9 Oct 2026" (or "9 Oct" with withYear: false) from "YYYY-MM-DD". */
export function fmtDate(iso: string | null | undefined, withYear = true): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return "—";
  const day = Number(m[3]);
  const mon = MONTHS[Number(m[2]) - 1];
  return withYear ? `${day} ${mon} ${m[1]}` : `${day} ${mon}`;
}

/** Plain-language direction of a move for screen readers and captions. */
export function moveWord(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || Math.abs(n) < 0.05) return "flat";
  return n > 0 ? "up" : "down";
}

/** Colour class for a signed number. Always shown together with the sign, so colour is never the only cue. */
export function toneClass(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || Math.abs(n) < 0.05) return "text-ink-2";
  return n > 0 ? "text-good" : "text-bad";
}
