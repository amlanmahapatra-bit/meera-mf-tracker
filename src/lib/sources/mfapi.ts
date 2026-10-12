import { getJson } from "../http";
import { seriesFromMfapi, type Point } from "../returns";

const BASE = "https://api.mfapi.in/mf";

type MfapiHistory = {
  meta?: { fund_house?: string; scheme_name?: string; scheme_category?: string };
  data?: { date: string; nav: string }[];
};

export type SchemeInfo = {
  schemeCode: number;
  name: string;
  fundHouse: string | null;
  category: string | null;
  series: Point[];
};

/** Full NAV history for one scheme. Throws if the scheme does not exist or has no usable data. */
export async function fetchScheme(code: number): Promise<SchemeInfo> {
  if (!Number.isInteger(code) || code <= 0) throw new Error(`Invalid scheme code: ${code}`);
  const j = await getJson<MfapiHistory>(`${BASE}/${code}`);
  const series = seriesFromMfapi(j.data ?? []);
  if (!j.meta?.scheme_name || series.length === 0) throw new Error(`Scheme ${code} not found or has no NAV data`);
  return {
    schemeCode: code,
    name: j.meta.scheme_name,
    fundHouse: j.meta.fund_house ?? null,
    category: j.meta.scheme_category ?? null,
    series,
  };
}

export type SearchHit = { schemeCode: number; schemeName: string };

/** True for plain "Direct" + "Growth" plans; hides IDCW / dividend / bonus / regular plans. */
export function isDirectGrowth(name: string): boolean {
  return /direct/i.test(name) && /growth/i.test(name) && !/idcw|dividend|bonus|payout|reinvest/i.test(name);
}

/** Search by fund name; only Direct + Growth plans are returned (Meera never sees IDCW/Bonus). */
export async function searchFunds(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const rows = await getJson<SearchHit[]>(`${BASE}/search?q=${encodeURIComponent(q)}`);
  return rows.filter((r) => isDirectGrowth(r.schemeName));
}

let allSchemesCache: { at: number; rows: SearchHit[] } | null = null;

/** Every scheme mfapi knows (about 38,000, ~2 MB). Cached for an hour because it changes rarely. */
export async function fetchAllSchemes(): Promise<SearchHit[]> {
  if (allSchemesCache && Date.now() - allSchemesCache.at < 3_600_000) return allSchemesCache.rows;
  const rows = await getJson<SearchHit[]>(BASE, { timeoutMs: 30_000 });
  allSchemesCache = { at: Date.now(), rows };
  return rows;
}
