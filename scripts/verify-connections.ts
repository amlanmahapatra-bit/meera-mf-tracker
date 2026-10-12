/**
 * Step 2: prove every outside connection works BEFORE building on it.
 * Run:  npm run verify        (reads .env.local automatically)
 * Nothing here is mocked: every line of output comes from a real request.
 */
import { createClient } from "@supabase/supabase-js";

const TIMEOUT_MS = 15_000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"; // from ai.google.dev model list

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

/** fetch with a timeout and one retry on network errors / 5xx. */
async function http(url: string, init: RequestInit = {}): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (meera-mf-tracker verify)", ...(init.headers || {}) },
      });
      if (res.status >= 500 && attempt === 1) continue;
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  const cause = (lastErr as { cause?: { code?: string } })?.cause?.code;
  throw new Error(`${(lastErr as Error).message}${cause ? ` (${cause})` : ""}`);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}\n      ${detail}`);
  } catch (e) {
    const detail = (e as Error).message;
    results.push({ name, ok: false, detail });
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
}

const FUNDS: Record<string, string> = {
  "118482": "Bandhan Nifty 50 (Large Cap)",
  "147622": "Motilal Nifty Midcap 150 (Mid Cap)",
  "147623": "Motilal Nifty Smallcap 250 (Small Cap)",
  "120062": "HSBC Short Duration (Debt)",
  "150751": "Axis NASDAQ 100 FoF (International)",
};

// Candidate Yahoo Finance symbols. We test them all and report which work.
const INDEX_CANDIDATES: Record<string, string> = {
  "Nifty 50": "^NSEI",
  "Nifty Midcap 150": "NIFTYMIDCAP150.NS",
  "Nifty Smallcap 100": "^CNXSC",
  "Nifty Smallcap 250": "NIFTYSMLCAP250.NS",
  "Nasdaq 100": "^NDX",
};

async function main() {
  console.log(`Verification run at ${new Date().toISOString()}\n`);

  // 0. Environment variables (names only, never values)
  console.log("== Environment variables ==");
  for (const n of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "GNEWS_API_KEY"]) {
    console.log(`      ${n}: ${process.env[n]?.trim() ? "set" : "MISSING"}`);
  }

  console.log("\n== 1. NAV data (mfapi.in) ==");
  for (const [code, label] of Object.entries(FUNDS)) {
    await check(`NAV latest ${code} ${label}`, async () => {
      const res = await http(`https://api.mfapi.in/mf/${code}/latest`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { meta?: { scheme_name?: string }; data?: { date: string; nav: string }[] };
      const d = j.data?.[0];
      if (!d || !/^\d{2}-\d{2}-\d{4}$/.test(d.date) || !(Number(d.nav) > 0)) throw new Error("unexpected shape");
      return `${j.meta?.scheme_name} | NAV ${d.nav} on ${d.date}`;
    });
  }
  await check("NAV full history 118482", async () => {
    const res = await http("https://api.mfapi.in/mf/118482");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { data: { date: string }[] };
    return `${j.data.length} daily NAVs, newest ${j.data[0].date}, oldest ${j.data[j.data.length - 1].date}`;
  });
  await check("Fund search by name", async () => {
    const res = await http("https://api.mfapi.in/mf/search?q=nasdaq%20100");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { schemeCode: number; schemeName: string }[];
    const direct = j.filter((s) => /direct/i.test(s.schemeName) && /growth/i.test(s.schemeName) && !/idcw|bonus/i.test(s.schemeName));
    return `${j.length} results, ${direct.length} are Direct+Growth, e.g. ${direct[0]?.schemeName}`;
  });

  console.log("\n== 2. Index prices (Yahoo Finance chart API) ==");
  for (const [label, symbol] of Object.entries(INDEX_CANDIDATES)) {
    await check(`Index ${label} (${symbol})`, async () => {
      const res = await http(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] };
      };
      const r = j.chart?.result?.[0];
      const closes = r?.indicators.quote[0].close ?? [];
      const ts = r?.timestamp ?? [];
      const idx = closes.map((c, i) => (c == null ? -1 : i)).filter((i) => i >= 0);
      if (!idx.length) throw new Error("no closing prices returned");
      const last = idx[idx.length - 1];
      return `${idx.length} closes, last ${closes[last]!.toFixed(2)} on ${new Date(ts[last] * 1000).toISOString().slice(0, 10)}`;
    });
  }

  console.log("\n== 3. News ==");
  const gnewsKey = process.env.GNEWS_API_KEY?.trim();
  await check("GNews API", async () => {
    if (!gnewsKey) throw new Error("GNEWS_API_KEY is not set");
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent("RBI OR inflation OR Sensex OR Nifty")}&lang=en&country=in&max=5&apikey=${gnewsKey}`;
    const res = await http(url);
    const body = (await res.json().catch(() => ({}))) as { articles?: { title: string; source: { name: string } }[]; errors?: unknown };
    if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body.errors ?? "")}`);
    return `${body.articles?.length} articles, first: "${body.articles?.[0]?.title}" (${body.articles?.[0]?.source.name})`;
  });
  await check("Google News RSS fallback (no key)", async () => {
    const url = "https://news.google.com/rss/search?q=RBI+OR+inflation+OR+Sensex+when:7d&hl=en-IN&gl=IN&ceid=IN:en";
    const res = await http(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const titles = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].map((m) => m[1]);
    if (!titles.length) throw new Error("no <item> entries found in feed");
    return `${titles.length} items, first: "${titles[0]}"`;
  });

  console.log("\n== 4. Supabase ==");
  const sbUrl = process.env.SUPABASE_URL?.trim() ? new URL(process.env.SUPABASE_URL.trim()).origin : undefined; // strips a pasted "/rest/v1/"
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sb = sbUrl && sbKey ? createClient(sbUrl, sbKey, { auth: { persistSession: false } }) : null;
  await check("Supabase funds table (expect 5 seeded rows)", async () => {
    if (!sb) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    const { data, error } = await sb.from("funds").select("name, scheme_code, active");
    if (error) throw new Error(error.message);
    return `${data.length} rows: ${data.map((f) => f.scheme_code).join(", ")}`;
  });
  for (const table of ["nav_history", "index_history", "weekly_snapshots", "weekly_reports", "pipeline_runs"]) {
    await check(`Supabase table ${table} exists`, async () => {
      if (!sb) throw new Error("Supabase credentials not set");
      const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message + (table === "pipeline_runs" ? " (expected: this table still needs a migration)" : ""));
      return `${count} rows`;
    });
  }

  console.log(`\n== 5. Gemini (${GEMINI_MODEL}) ==`);
  const gKey = process.env.GEMINI_API_KEY?.trim();
  await check("Gemini model is available to this key", async () => {
    if (!gKey) throw new Error("GEMINI_API_KEY is not set");
    const res = await http(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}?key=${gKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { name: string; displayName: string };
    return `${j.name} (${j.displayName})`;
  });
  await check("Gemini structured JSON output", async () => {
    if (!gKey) throw new Error("GEMINI_API_KEY is not set");
    const res = await http(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": gKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "In one plain sentence, say that a mutual fund fell 1.2% this week while the market fell 1.0%." }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: { sentence: { type: "STRING" } }, required: ["sentence"] },
        },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const parsed = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    if (typeof parsed.sentence !== "string") throw new Error("response did not match schema");
    return `valid JSON: "${parsed.sentence}"`;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== Summary: ${results.length - failed.length}/${results.length} checks passed ==`);
  for (const f of failed) console.log(`  FAILED: ${f.name} -> ${f.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main();
