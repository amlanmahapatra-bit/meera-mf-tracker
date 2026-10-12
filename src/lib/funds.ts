/**
 * Add / remove a fund with no code changes. Pure helpers live here (and are unit-tested);
 * the database and network work is in funds-service.ts.
 */
import { BENCHMARKS } from "./config";

export const MAX_ACTIVE_FUNDS = 8;
export const SLOT_SUGGESTIONS = ["Large Cap", "Mid Cap", "Small Cap", "Short Duration Debt", "International"] as const;

/** Display order of funds: the standard slots first, anything custom after. */
export const slotRank = (slot: string) => {
  const i = (SLOT_SUGGESTIONS as readonly string[]).indexOf(slot);
  return i === -1 ? SLOT_SUGGESTIONS.length : i;
};

export type Suggestion = { slot: string; benchmarkName: string | null; reason: string };

/** Guesses a sensible slot and index from the fund's name (the form pre-fills these; Meera can change them). */
export function suggestSlotAndBenchmark(fundName: string, category?: string | null): Suggestion {
  const n = fundName.toLowerCase();
  const c = (category ?? "").toLowerCase();
  if (/nasdaq[\s-]*100/.test(n)) return { slot: "International", benchmarkName: "Nasdaq 100", reason: "The name mentions the Nasdaq 100." };
  if (/s&p 500|us specific|us equity|overseas|global|international|fang|world/.test(n) || /overseas|fof overseas/.test(c))
    return { slot: "International", benchmarkName: null, reason: "It invests abroad; we have no free index for it, so it is compared with similar funds." };
  if (/smallcap\s*250|small cap\s*250/.test(n)) return { slot: "Small Cap", benchmarkName: "Nifty Smallcap 250", reason: "The name mentions the Nifty Smallcap 250." };
  if (/small\s*cap/.test(n)) return { slot: "Small Cap", benchmarkName: null, reason: "A small-cap fund; no matching free index, so it is compared with similar funds." };
  if (/midcap\s*150|mid cap\s*150/.test(n)) return { slot: "Mid Cap", benchmarkName: "Nifty Midcap 150", reason: "The name mentions the Nifty Midcap 150." };
  if (/mid\s*cap/.test(n)) return { slot: "Mid Cap", benchmarkName: null, reason: "A mid-cap fund; no matching free index, so it is compared with similar funds." };
  if (/nifty\s*50\b|nifty50|sensex/.test(n) && !/next/.test(n)) return { slot: "Large Cap", benchmarkName: "Nifty 50", reason: "The name mentions the Nifty 50." };
  if (/large\s*cap|bluechip|blue chip/.test(n)) return { slot: "Large Cap", benchmarkName: null, reason: "A large-cap fund; compared with similar funds unless you pick an index." };
  if (/short (duration|term)|ultra short|low duration|liquid|money market|corporate bond|banking|gilt|debt|bond/.test(n) || /debt/.test(c))
    return { slot: "Short Duration Debt", benchmarkName: null, reason: "A debt fund; there is no free index, so it is compared with similar funds." };
  return { slot: "Other", benchmarkName: null, reason: "We could not tell the type from the name; please pick one." };
}

/** The distinctive part of a fund's name, used to look for similar funds from other fund houses. */
export function coreName(fundName: string, fundHouse?: string | null): string {
  let s = fundName;
  if (fundHouse) {
    for (const w of fundHouse.split(/\s+/).filter((x) => x.length > 2)) s = s.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig"), " ");
  }
  return s
    .replace(/\b(direct|plan|growth|option|regular|fund|scheme)\b/gi, " ")
    .replace(/[-–()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type AddFundInput = { schemeCode: number; slot: string; benchmarkName: string | null };

/** Checks what the form sent. Returns a plain-language error or the cleaned input. */
export function parseAddFundInput(body: unknown): { ok: true; value: AddFundInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = Number(b.schemeCode);
  if (!Number.isInteger(code) || code < 1 || code > 99_999_999) return { ok: false, error: "Please enter a valid scheme code (a whole number)." };
  const slot = typeof b.slot === "string" ? b.slot.trim() : "";
  if (slot.length < 2 || slot.length > 40) return { ok: false, error: "Please choose a name for this slot (2 to 40 characters), like \"Large Cap\"." };
  let benchmarkName: string | null = null;
  if (b.benchmarkName !== undefined && b.benchmarkName !== null && b.benchmarkName !== "") {
    if (typeof b.benchmarkName !== "string" || !(b.benchmarkName in BENCHMARKS)) {
      return { ok: false, error: `That index is not available. Choose one of: ${Object.keys(BENCHMARKS).join(", ")}, or leave it empty.` };
    }
    benchmarkName = b.benchmarkName;
  }
  return { ok: true, value: { schemeCode: code, slot, benchmarkName } };
}

/** Same-category check so a mid-cap fund is not averaged with, say, gold funds. Falls back to "yes" if unknown. */
export function sameKind(categoryA: string | null, categoryB: string | null): boolean {
  if (!categoryA || !categoryB) return true;
  return categoryA.trim().toLowerCase() === categoryB.trim().toLowerCase();
}
