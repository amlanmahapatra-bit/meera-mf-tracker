# Project: Meera's Mutual Fund Intelligence Tracker

MESA Cohort C4, "AI and its Applications" final exam, Problem Statement 19 (High Difficulty).
Goal: build and deploy a tracker that turns raw mutual fund NAVs into a plain-language
Saturday-morning report for a non-expert investor, "Meera". We are aiming for full marks,
so reliability and polish matter more than the number of features.

## Hard rules from the exam (never break these)
1. **All AI tasks in the app use Gemini Flash.** Never call the Claude/Anthropic API from the app.
   Look up the current Gemini Flash model name in Google's docs before coding. Do not guess it.
2. Use **live external data** wherever possible. The deployed site must show real data at submission.
3. Deploy on **Vercel**. Deliverables: public Vercel URL, GitHub repo, and a **Components Map**.
4. Store weekly snapshots in **Supabase**.
5. Meera must be able to **add or remove a fund** from a web form with **no code changes**.
6. Secrets live only in environment variables. Never commit keys. `.env.local` must be in `.gitignore`.

## The user
Meera, 28, has 5 SIPs, is not a finance professional and hates jargon. Every piece of text she sees
must be plain language ("your fund did slightly worse than the market" not "negative alpha").

## Stack
Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres), Vercel (hosting + Cron), Gemini Flash.
Keep it simple. Prefer a few well-tested modules over many dependencies.

## Environment variables
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # server-side only, never exposed to the browser
GEMINI_API_KEY=
GNEWS_API_KEY=
CRON_SECRET=                    # protects /api/cron/* routes (Vercel sends it as a Bearer token)
ADMIN_PASSCODE=                 # simple passcode needed to add/remove funds from the form
```

## Database (already created in Supabase, see schema.sql)
Tables: `funds`, `nav_history`, `index_history`, `weekly_snapshots`, `weekly_reports`.
RLS is on with no public policies, so ALL database access goes through server code using the service role key.
`funds` is already seeded with 5 funds:

| Slot | Name | scheme_code | Benchmark |
|---|---|---|---|
| Large Cap | Bandhan Nifty 50 Index Fund Direct Growth | 118482 | Nifty 50 |
| Mid Cap | Motilal Oswal Nifty Midcap 150 Index Fund Direct Growth | 147622 | Nifty Midcap 150 |
| Small Cap | Motilal Oswal Nifty Smallcap 250 Index Fund Direct Growth | 147623 | Nifty Smallcap 250 |
| Short Duration Debt | HSBC Short Duration Fund Direct Growth | 120062 | none (see below) |
| International | Axis NASDAQ 100 FoF Direct Growth | 150751 | Nasdaq 100 |

`peer_codes` holds peer fund codes used for the category average. International peers are empty:
search mfapi for other international/US-equity FoF Direct Growth funds and fill them in.
`benchmark_symbol` is empty for all funds: choose and verify a free index data source first (see Data sources).

## Data sources (VERIFY each one with a real request before building on it)
- **NAV:** `https://api.mfapi.in/mf/{code}` (full history) and `/mf/{code}/latest`. Confirmed working.
  Dates come as `DD-MM-YYYY`. Latest NAV is the previous trading day's (no weekend NAVs).
  Search endpoint: `https://api.mfapi.in/mf/search?q=...` (returns ~10 results max; includes IDCW/Bonus plans).
- **Index prices:** need Nifty 50, Nifty Midcap 150, Nifty Smallcap 100 (required by the brief), Nifty Smallcap 250
  and Nasdaq 100. Test free options (e.g. Yahoo Finance chart API, niftyindices.com) and pick what actually works
  from a Vercel server. Cache closes in `index_history`. If a source fails, fall back gracefully and say so in the UI.
- **News:** GNews API (`GNEWS_API_KEY`). Pull the week's India market and macro headlines (RBI, inflation, FII flows,
  global markets, oil, US Fed). Keep the top handful; do not send huge payloads to Gemini.
  GNews free plan is roughly 100 requests/day and 10 articles per request (verify on gnews.io). We need only a few
  requests per week. **Add Google News RSS (no API key) as an automatic fallback** if GNews fails or is rate-limited,
  so the Saturday report never breaks. Say in the UI which source was used.
- Check each provider's current free-tier limits and Vercel Hobby limits (cron frequency, function timeout) before designing.

## Core logic (deterministic code, NOT the AI)
All numbers are computed in code. Gemini only explains them and must never invent or recompute figures.

1. **Returns:** week-on-week (vs 7 days ago), month-on-month (vs 1 month ago), year-to-date (vs last trading day of
   previous year). If a target date has no NAV (weekend/holiday), use the nearest EARLIER available date.
2. **Benchmark comparison:** same three windows for the fund's benchmark index. gap = fund return minus benchmark return.
3. **Category average:** average return of the fund's `peer_codes` over the same windows. State the method in the UI
   ("average of N similar funds"). Skip peers that fail to load and report how many were used.
4. **Debt fund (no free benchmark):** compare against its category average only, and say so plainly. Never fake a benchmark.
5. **"Market or fund?" split (signature feature):** for the weekly move, market_part = benchmark return,
   fund_part = fund return minus benchmark return. Show it as e.g. "Of the 2.1% drop, 1.9% was the whole market, 0.2% was this fund".
6. **Status per fund (green / amber / red)** from simple, documented thresholds on the gap and on `weeks_lagging`
   (consecutive weeks behind the benchmark, from `weekly_snapshots`). Put thresholds in one config file.
7. **Candidate verdict** computed in code from the statuses: "No action needed", "One fund worth watching",
   or "Consider reviewing your allocation". Pass it to Gemini as a suggestion.

## Gemini usage
- Single structured call per weekly report, using JSON output / a response schema.
- Input: computed numbers per fund, index moves for the week, top headlines, last few weeks' status, candidate verdict.
- Output (validate with a schema, retry once, then fall back to a template built from the numbers):
  - per fund: exactly three plain-language sentences covering (1) performance, (2) comparison to benchmark/category,
    (3) which market events explain the difference (cite only headlines actually provided).
  - overall: verdict (one of the three exact strings) plus a specific one-sentence reason.
- Prompt rules: no jargon, no invented numbers, no investment advice or buy/sell calls, calm tone, say "I don't know" when news doesn't explain a move.
- Optional Hinglish toggle: same call with a language flag.

## Features
**Must have**
1. Daily cron: fetch latest NAV for all active funds, upsert into `nav_history`.
2. Saturday-morning cron: build index/news context, compute snapshots, call Gemini, save to `weekly_snapshots` and `weekly_reports`.
3. Dashboard (home page): latest report, verdict banner, one traffic-light card per fund (returns, vs benchmark, vs category,
   market-vs-fund split, the 3-sentence summary), and a multi-week trend chart from stored snapshots.
4. Add/remove fund form: Meera searches by fund NAME (calls mfapi search, filters to "Direct" + "Growth" plans only,
   hides IDCW/Bonus), or pastes a scheme code. On add: validate the code with mfapi, backfill NAV history, ask for slot/benchmark
   (suggest from the fund name), find peers. Remove = set `active=false`. Protected by `ADMIN_PASSCODE`.
5. A "run now" admin action (or protected route) that triggers the whole pipeline manually. REQUIRED so the site has real
   data at submission: backfill NAV history from mfapi and generate the first report immediately.
6. Graceful failures: if any API is down, show last good data with a small "data as of {date}" note, never a blank crash.

**Standout (do after the must-haves work end to end)**
7. "Send to my CA" button: opens `https://wa.me/?text=` with a clean pre-written summary of the report.
8. "Ask about my money" chat box: Gemini answers using only her stored data and the week's headlines.
9. English / Hinglish toggle.
10. Saturday email delivery via a free email service.

## Build order (commit after each step, keep `main` always deployable)
1. Scaffold Next.js app, Supabase server client, env handling, `.gitignore`.
2. Data-source verification script: prove NAV, index, news and Gemini calls work. Report back before going further.
3. Returns engine + unit tests (weekend fallback, year-start, missing data).
4. Index data + benchmark/category comparison.
5. Pipeline: snapshots, status rules, candidate verdict.
6. Gemini report with schema validation and fallback.
7. Dashboard UI (mobile-friendly, calm, jargon-free).
8. Add/remove fund flow.
9. Cron routes (protected by `CRON_SECRET`) and `vercel.json`.
10. Standout features.
11. `docs/COMPONENTS_MAP.md`: a diagram (Mermaid) plus a short table of every component, what it does, and the data it uses.
    This is a required submission item and is graded. Also a clear README (setup, env vars, how it works, limitations).

## Definition of done
- Public Vercel URL loads and shows a real weekly report with real numbers.
- Adding and removing a fund from the form works without touching code.
- Cron routes are configured and secured; the first run has been done manually.
- No secrets in the repo. `docs/COMPONENTS_MAP.md` (plus PNG/PDF export), `docs/TRADEOFFS.md`, `docs/DEMO.md` and the README are in the repo.
- Tests pass, jobs are idempotent, and `pipeline_runs` shows successful runs.
- Known limitations (category average method, debt fund benchmark, index data source) are stated honestly in the README.

## Examiner's grading rubric (spend effort in proportion to these weights)
The build is 60% of the grade (the other 40% is assessed separately; ask the owner what it is if relevant).
The examiner states they look at: building multi-step systems, tool/API usage, backend logic, technical trade-offs,
and reliability of the overall system.

| Build component | Weight | How we win it |
|---|---|---|
| **Backend Logic & Build Quality** | **25%** | Clean multi-stage pipeline (fetch, store, compute, context, generate, validate, store, render). Idempotent jobs (re-running never duplicates data). Timeouts, retries, fallbacks, input validation. Unit tests on the returns engine. Clear folder structure, typed code, small focused modules, meaningful comments. Add a `pipeline_runs` table (propose the SQL migration and tell the owner to run it in Supabase) logging each job's start, end, status and error so reliability is visible. |
| **Components Map** | 10% | `docs/COMPONENTS_MAP.md` with a Mermaid diagram of the full data flow (external APIs, cron, Supabase, Gemini, dashboard, add/remove form) plus a table of every component, its job, inputs, outputs and failure behaviour. Also export a clean PNG or PDF of the diagram the owner can submit. |
| **Working Vercel Link** | 10% | Public URL loads fast, never blank, shows real data at submission. First pipeline run done manually and verified. Environment variables set in Vercel. Test the live URL, not just localhost. |
| **Design** | 10% | Calm, clean, consistent, mobile-friendly. Clear visual hierarchy: verdict banner first, then fund cards. Plain language, traffic lights that also use icons/text. Good empty, loading and error states. |
| **Demo Video** | 5% | Write `docs/DEMO.md`: a 3 to 4 minute click-through script (the problem and Meera; dashboard and verdict; one fund card explained; add a fund by name live; run the pipeline; architecture and Components Map; one trade-off). The owner records it. |

**Technical trade-offs (explicitly assessed):** write `docs/TRADEOFFS.md`. For each major decision give the choice,
the alternatives considered, and why we chose it. Cover at least: free MF API vs paid data; index data source choice and its
reliability; category average from peer funds vs a paid benchmark; deterministic code for numbers vs LLM for narration;
Gemini Flash vs a larger model (cost, speed, quality); structured JSON output with validation and template fallback;
Supabase with server-only access and RLS vs client-side access; Vercel Cron limits and how jobs are batched;
GNews with RSS fallback; storing weekly snapshots vs recomputing history. Be honest about weaknesses.

**Priority order when time is short:** (1) must-have features working end to end, (2) backend quality, tests, reliability,
(3) design polish, (4) Components Map, TRADEOFFS, README, (5) live URL verified with seeded data, (6) demo script,
(7) standout features. Of the standout features, build the WhatsApp "Send to my CA" button and the "market vs fund" split first
(cheap and memorable in a demo); Hinglish toggle and email delivery are lowest priority.

## Exam requirement checklist (every sentence of the brief must map to something that works)
Keep this table in the README, with a "where it lives" column filled in with real file paths, and tick it off at the end.

| # | Requirement from the brief | How we satisfy it |
|---|---|---|
| 1 | Fetch latest NAV for each of the five funds **daily** from India's public MF APIs | Daily cron + `nav_history` (mfapi.in) |
| 2 | Week-on-week, month-on-month and year-to-date returns per fund | Returns engine (with weekend/holiday fallback) |
| 3 | Compare to the fund's **benchmark index** and its **category average** from public MF data | Index history + peer-average method (stated openly) |
| 4 | **Every Saturday** fetch Nifty 50, Nifty Midcap 150, **Nifty Smallcap 100** moves **and significant macro events** via a news API | Saturday cron: index moves + GNews (RSS fallback) |
| 5 | Gemini writes a plain-language Saturday report: per fund **three sentences** (performance, benchmark comparison, market events explaining the gap) | Gemini Flash, structured JSON, validated |
| 6 | Close with overall assessment: "No action needed" / "One fund worth watching" / "Consider reviewing your allocation" **with a specific reason** | Verdict enum + reason, validated, DB-constrained |
| 7 | All weekly snapshots stored in Supabase for **multi-week trend tracking** | `weekly_snapshots` + trend chart |
| 8 | Add/remove a fund by **scheme code** in a Vercel form, **no code changes** | Add/remove form (also search by name) |
| 9 | Delivered **every Saturday morning** | Vercel Cron. Cron runs in UTC; schedule for Saturday morning **IST** (IST = UTC+5:30). Verify the plan's cron limits. |
| 10 | Submit working public Vercel URL + GitHub repo + **Components Map** | Deployed site, repo, `docs/COMPONENTS_MAP.md` |
| 11 | All AI tasks use **Gemini Flash**, never the Claude API | Only the Gemini SDK/REST in app code |
| 12 | Use **live external data** wherever possible; system must **work with some data at submission** | Live APIs + first run seeded before submitting |

Note on two honest limits to state in the README (do not hide them): the small-cap fund tracks the Nifty Smallcap 250
while market context also shows the Smallcap 100 the brief asks for; and the debt fund has no free benchmark, so it is
compared with its category average only.

## Quality bar (what separates full marks from a pass)
- **Reliability first:** every external call has a timeout, retry, and a graceful fallback. The site must never show a blank page.
- **Plain language everywhere:** a person who has never heard of "benchmark" or "alpha" must understand every sentence. Add a small hover glossary.
- **Honest numbers:** every figure on screen is computed in code and traceable. Show "data as of {date}" and the method behind the category average.
- **A "How this works" page** on the site that explains the pipeline and the methodology in simple terms. Graders will look for it.
- **Tests** for the returns engine (weekend fallback, year start, missing NAV, peer failures).
- **Polish:** mobile-friendly, clear loading/empty/error states, consistent design, accessible colours (traffic lights also use icons or text, not colour alone).
- **Security:** no secrets in the repo, cron routes need `CRON_SECRET`, fund changes need `ADMIN_PASSCODE`, validate all input.
- **Submission readiness:** README with setup, env vars, architecture, limitations, and the requirement checklist above;
  Components Map; a short demo script (the order to click through the site) in `docs/DEMO.md`.
- Commit often with clear messages; keep `main` deployable.

## Working style
- Explain what you are about to do in plain language; the owner is new to AI and web development.
- Run things and show the real output instead of assuming. Verify APIs before depending on them.
- Ask before adding paid services or anything outside this brief.
