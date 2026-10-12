# Meera's Money Check

A calm, plain-language **Saturday-morning check-up for a non-expert investor's mutual funds**.
It fetches live prices, works out how each fund did, compares it with the market and with similar funds,
and has **Gemini Flash** explain the result in everyday words. Built for the MESA Cohort C4 "AI and its
Applications" exam (Problem Statement 19).

> **Status:** backend and website built and tested; the Vercel deployment is the remaining item. See [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) for the line-by-line tracker.
>
> **Live site:** _to be added after deployment_

## How it works (in simple words)

1. **Every morning** a scheduled job saves the latest price of each fund (from mfapi.in) and the closing level of the market indexes (from Yahoo Finance) into our own database.
2. **Every Saturday morning** another job works out each fund's **week, month and year-so-far** return, then compares it with its **market index** and with the **average of similar funds**. It splits the week's move into "how much was the whole market, how much was this fund".
3. Simple, documented rules turn those gaps into a **green / amber / red** light for each fund and an overall verdict ("No action needed", "One fund worth watching" or "Consider reviewing your allocation").
4. That week's market headlines (GNews, or Google News as a backup) and all the computed numbers go to **Gemini Flash** (a Google model, reached through the OpenRouter gateway) in one call. It writes three plain sentences per fund. **It never calculates anything**; its answer is checked and rejected if it invents a number, uses jargon, gives advice or quotes a headline we did not give it. If Gemini is unavailable, a built-in template writes the text from the same numbers.
5. Everything is stored in **Supabase** so weeks can be compared over time.

Details and diagram: [`docs/COMPONENTS_MAP.md`](docs/COMPONENTS_MAP.md). Design decisions and their weaknesses: [`docs/TRADEOFFS.md`](docs/TRADEOFFS.md).

## Setup

Requires Node 22+, a Supabase project, an OpenRouter API key (for Gemini Flash) and (optionally) a GNews key.

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run verify                  # checks every outside connection with real requests
npm test                        # unit tests
npm run dev                     # http://localhost:3000
```

Create the tables in the Supabase SQL editor: run `sql/000_schema_reference.sql` (funds, nav_history, index_history, weekly_snapshots, weekly_reports; skip if your project already has them) and then `sql/001_pipeline_runs.sql`. Seed the `funds` table with your funds (or add them later from the form/API).

### Environment variables

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (a trailing `/rest/v1/` is tolerated) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database key. Never exposed to the browser |
| `OPENROUTER_API_KEY` | Gives access to Gemini Flash (the only AI used) through OpenRouter. Optional `AI_MODELS="google/a,google/b"` overrides the model order; every id must start with `google/` |
| `GNEWS_API_KEY` | GNews. Optional: without it the Google News RSS backup is used |
| `CRON_SECRET` | Protects `/api/cron/*` (Vercel sends it as a Bearer token) |
| `ADMIN_PASSCODE` | Needed to add/remove funds and to use "Run now" (header `x-admin-passcode`) |

Secrets live only in environment variables; `.env.local` is git-ignored.

### Useful commands

| Command | What it does |
|---|---|
| `npm run verify` | Real requests to every data source, Supabase and Gemini |
| `npm run demo:returns` / `npm run demo:comparison` | Show the returns and comparison maths on live data |
| `npm run pipeline -- daily \| weekly \| both` | Run the real jobs from your terminal |
| `npm test` | 105 unit tests |

### API (all server-side)

| Route | Who | Does |
|---|---|---|
| `GET /api/cron/daily`, `GET /api/cron/weekly` | Vercel Cron, `Authorization: Bearer CRON_SECRET` | The scheduled jobs (daily 07:00 IST, Saturday 07:30 IST; see `vercel.json`) |
| `POST /api/admin/run` | Passcode | "Run now": save prices, build the report |
| `GET /api/funds` | Public | Funds being tracked |
| `GET /api/funds/search?q=` / `GET /api/funds/preview?code=` | Passcode | Search by name (Direct Growth only) / look up a code and suggest slot + index |
| `POST /api/funds`, `DELETE /api/funds` | Passcode | Add a fund (validates, backfills prices, finds similar funds) / remove (switches off, keeps history) |
| `GET /api/health` | Public | The last 10 job runs |

## Exam requirement checklist

| # | Requirement from the brief | How we satisfy it | Where it lives | State |
|---|---|---|---|---|
| 1 | Fetch latest NAV for each fund **daily** from India's public MF APIs | Daily cron saves prices from mfapi.in into `nav_history` | `src/lib/pipeline/daily.ts`, `src/app/api/cron/daily/route.ts`, `vercel.json` | ✅ code · live on Vercel ⏳ |
| 2 | Week-on-week, month-on-month, year-to-date returns | Returns engine with weekend/holiday fallback | `src/lib/returns.ts` (+ tests) | ✅ |
| 3 | Compare to **benchmark index** and **category average** | Matched-date comparison; peer average stated openly | `src/lib/comparison.ts`, `src/lib/sources/indices.ts` | ✅ |
| 4 | **Every Saturday**: Nifty 50, Midcap 150, **Smallcap 100** moves + macro events via a news API | Saturday job: index moves + GNews (RSS fallback). Smallcap 100: see limitation 1 | `src/lib/pipeline/weekly.ts`, `src/lib/sources/news.ts` | ✅ (Smallcap 100 ➖) |
| 5 | Gemini writes the plain-language report, three sentences per fund | Gemini Flash (`google/gemini-3.7-flash` via OpenRouter), structured JSON, validated, retried once, template fallback | `src/lib/gemini.ts`, `gemini-validate.ts`, `report-writer.ts`, `report-template.ts` | ✅ verified live |
| 6 | Overall assessment with the three exact strings and a specific reason | Computed in code, finalised by Gemini, enforced by a database CHECK | `src/lib/status.ts`, `src/lib/config.ts`, table `weekly_reports` | ✅ |
| 7 | All weekly snapshots in Supabase for **multi-week trend tracking** | `weekly_snapshots`, one row per fund per week | `src/lib/db.ts`, `src/lib/pipeline/weekly.ts` | ✅ stored · trend chart ⏳ |
| 8 | Add/remove a fund by **scheme code** in a Vercel form, no code changes | API done (also search by name); web form to come | `src/app/api/funds/*`, `src/lib/funds-service.ts` | 🟡 API ✅ · form ⏳ |
| 9 | Delivered **every Saturday morning** | Vercel Cron, `0 2 * * 6` UTC = 07:30 IST | `vercel.json` | ✅ configured · live ⏳ |
| 10 | Submit working Vercel URL + GitHub repo + **Components Map** | Repo ✅; map ✅; URL ⏳ | `docs/COMPONENTS_MAP.md` | 🟡 |
| 11 | All AI uses **Gemini Flash**, never the Claude API | Only `google/` models are accepted (the code refuses to start otherwise), pinned to Google's own servers through OpenRouter; no AI SDK installed | `src/lib/gemini.ts` | ✅ |
| 12 | **Live external data**; works with some data at submission | Live APIs; the first run has been done manually and a real report is stored | `src/lib/pipeline/*`, `/api/admin/run` | ✅ locally · on Vercel ⏳ |

## Known limitations (stated honestly)

1. **Nifty Smallcap 100 is not available.** The brief asks for it as market context, but no free source provides its history (Yahoo returns a single price; niftyindices.com returns a web page to servers). The small-cap fund tracks the **Nifty Smallcap 250**, which is used instead, and the site says so.
2. **The debt fund has no free benchmark.** HDFC Short Term Fund is compared with the average of similar debt funds only, and the site says so. (The originally planned HSBC fund's prices stopped in 2022, so it was replaced.)
3. **"Category average" is our own method**: the average of similar Direct Growth funds from other fund houses (e.g. "average of 9 similar funds"), not an official category figure. Large Cap has only 2 peers.
4. **Index levels are price indexes; fund prices include reinvested dividends.** Over longer windows (year to date) a fund can therefore look slightly ahead of its index (about 0.7 points for the Nifty 50 fund) without really outperforming. Week and month comparisons are barely affected.
5. **Index data is from Yahoo Finance's unofficial endpoint.** If it is down we show saved closes with their date. The US-market fund is converted to rupees; a small week-level difference remains because the fund uses its own exchange-rate timing.
6. **The AI step depends on an OpenRouter account with credit.** A report costs about 1 US cent (`google/gemini-3.7-flash`). If the service is busy the call is retried (3 times, with backoff) and then the next Flash model is tried; if credits run out or Gemini is unreachable, a built-in template writes the text from the same numbers and the report says so. (Calling Google's free tier directly was abandoned: it allows only 20 requests a day per model.)
7. **Prices are for the previous trading day** (that is how NAVs are published); there are no weekend NAVs.
8. **Vercel Hobby plan:** two daily-or-slower cron jobs; the timing is approximate.
9. This is information, not investment advice.

## Project layout

```
src/lib/returns.ts          returns engine (pure, tested)
src/lib/comparison.ts       benchmark / category comparison, market-vs-fund split
src/lib/status.ts           traffic lights + verdict;  src/lib/config.ts  every threshold
src/lib/sources/            mfapi, Yahoo indices, GNews + RSS
src/lib/pipeline/           loaders, daily job, weekly job, run logger
src/lib/gemini*.ts          Gemini calls + answer checker;  report-*.ts  writer + template
src/lib/funds*.ts           add / remove / search funds
src/app/api/                cron, admin, funds and health routes
scripts/                    verify, demos, pipeline runner
sql/                        migrations to run in Supabase
docs/                       requirements tracker, components map, trade-offs, demo script
```
