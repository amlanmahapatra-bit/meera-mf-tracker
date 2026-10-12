/** Add / remove / list funds. Server-only. Every failure comes back as a plain-language message. */
import { daysBetween } from "./returns";
import { istToday } from "./dates";
import { BENCHMARKS } from "./config";
import { deleteFund, getActiveFunds, getFund, saveFund, setFundActive, upsertNav, type FundRow } from "./db";
import { coreName, MAX_ACTIVE_FUNDS, sameKind, suggestSlotAndBenchmark, type AddFundInput, type Suggestion } from "./funds";
import { mapLimit } from "./pipeline/load";
import { fetchAllSchemes, fetchScheme, isDirectGrowth, type SchemeInfo } from "./sources/mfapi";

export class UserFacingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Newest NAV must be recent; a fund whose prices stopped years ago can never be tracked. */
const MAX_NAV_AGE_DAYS = 14;
const MAX_PEERS = 9;

function assertTrackable(s: SchemeInfo) {
  if (!isDirectGrowth(s.name)) throw new UserFacingError(`"${s.name}" is not a Direct Growth plan. Please pick the Direct plan with the Growth option (not IDCW, Dividend, Bonus or Regular).`);
  const newest = s.series[s.series.length - 1].date;
  const age = daysBetween(newest, istToday());
  if (age > MAX_NAV_AGE_DAYS) throw new UserFacingError(`This fund's prices stopped updating on ${newest}, so it cannot be tracked.`);
}

/** Looks up a code and proposes a slot and index, for the form to pre-fill. Does not save anything. */
export async function previewFund(schemeCode: number): Promise<{ schemeCode: number; name: string; fundHouse: string | null; latestNavDate: string; suggestion: Suggestion }> {
  let s: SchemeInfo;
  try {
    s = await fetchScheme(schemeCode);
  } catch {
    throw new UserFacingError("We could not find a fund with that code. Please check the number, or search by name.", 404);
  }
  assertTrackable(s);
  return {
    schemeCode,
    name: s.name,
    fundHouse: s.fundHouse,
    latestNavDate: s.series[s.series.length - 1].date,
    suggestion: suggestSlotAndBenchmark(s.name, s.category),
  };
}

/**
 * Similar funds from other fund houses: every word of the fund's distinctive name must appear
 * (e.g. "Nifty Midcap 150 Index"), it is a Direct Growth plan of the same category, and its prices are still updating.
 */
export async function findPeers(fund: SchemeInfo): Promise<number[]> {
  const tokens = coreName(fund.name, fund.fundHouse).toLowerCase().split(" ").filter((t) => t.length > 1);
  if (tokens.length === 0) return [];
  let candidates: { schemeCode: number; schemeName: string }[];
  try {
    candidates = (await fetchAllSchemes()).filter((h) => h.schemeCode !== fund.schemeCode && isDirectGrowth(h.schemeName) && tokens.every((t) => h.schemeName.toLowerCase().includes(t)));
  } catch {
    return []; // peers are a nice-to-have; the fund can still be added without them
  }
  const checked = await mapLimit(candidates.slice(0, 24), 5, async (c) => {
    try {
      const p = await fetchScheme(c.schemeCode);
      const fresh = daysBetween(p.series[p.series.length - 1].date, istToday()) <= MAX_NAV_AGE_DAYS;
      return fresh && sameKind(fund.category, p.category) ? c.schemeCode : null;
    } catch {
      return null;
    }
  });
  return checked.filter((c): c is number => c !== null).slice(0, MAX_PEERS);
}

export type AddResult = { schemeCode: number; name: string; slot: string; benchmarkName: string | null; peers: number; navRowsSaved: number; reactivated: boolean; note: string };

export async function addFund(input: AddFundInput): Promise<AddResult> {
  const existing = await getFund(input.schemeCode);
  if (existing?.active) throw new UserFacingError(`"${existing.name}" is already being tracked.`, 409);
  const active = await getActiveFunds();
  if (active.length >= MAX_ACTIVE_FUNDS) throw new UserFacingError(`You can track up to ${MAX_ACTIVE_FUNDS} funds. Remove one first.`, 409);

  let scheme: SchemeInfo;
  try {
    scheme = await fetchScheme(input.schemeCode);
  } catch {
    throw new UserFacingError("We could not find a fund with that code. Please check the number, or search by name.", 404);
  }
  assertTrackable(scheme);

  const peerCodes = await findPeers(scheme);
  const benchmark = input.benchmarkName ? BENCHMARKS[input.benchmarkName] : undefined;
  // The fund row must exist first: nav_history points at it. If the price backfill then fails, undo the add.
  await saveFund({
    scheme_code: scheme.schemeCode,
    name: scheme.name,
    fund_house: scheme.fundHouse,
    slot: input.slot,
    benchmark_name: input.benchmarkName,
    benchmark_symbol: benchmark?.symbol ?? null,
    peer_codes: peerCodes,
    active: true,
  });
  let navRowsSaved: number;
  try {
    navRowsSaved = await upsertNav(scheme.schemeCode, scheme.series); // backfill the whole history
  } catch (e) {
    if (existing) await setFundActive(scheme.schemeCode, false);
    else await deleteFund(scheme.schemeCode);
    console.error("Backfill failed, add undone:", (e as Error).message);
    throw new UserFacingError("We could not save this fund's price history, so it was not added. Please try again.", 502);
  }
  const note = input.benchmarkName
    ? `Compared with the ${input.benchmarkName} and ${peerCodes.length} similar funds.`
    : `No market index is set, so it is compared with ${peerCodes.length} similar fund${peerCodes.length === 1 ? "" : "s"} only.`;
  return { schemeCode: scheme.schemeCode, name: scheme.name, slot: input.slot, benchmarkName: input.benchmarkName, peers: peerCodes.length, navRowsSaved, reactivated: !!existing, note };
}

/** Removing never deletes history: the fund is switched off (active = false) and can be added back later. */
export async function removeFund(schemeCode: number): Promise<{ schemeCode: number; name: string }> {
  const f = await getFund(schemeCode);
  if (!f) throw new UserFacingError("That fund is not in your list.", 404);
  if (!f.active) throw new UserFacingError(`"${f.name}" has already been removed.`, 409);
  await setFundActive(schemeCode, false);
  return { schemeCode, name: f.name };
}

export type PublicFund = Pick<FundRow, "scheme_code" | "name" | "slot" | "benchmark_name"> & { peers: number };
export async function listFunds(): Promise<PublicFund[]> {
  return (await getActiveFunds()).map((f) => ({ scheme_code: f.scheme_code, name: f.name, slot: f.slot, benchmark_name: f.benchmark_name, peers: f.peer_codes.length }));
}
