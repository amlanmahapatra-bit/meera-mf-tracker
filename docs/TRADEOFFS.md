# Technical trade-offs

For each major decision: what we chose, what else we considered, and why. Weaknesses are stated openly.

## 1. Free mutual-fund API (mfapi.in) vs paid data

- **Chose:** mfapi.in (free, no key, full NAV history back to 2013, plus name search).
- **Considered:** AMFI's raw NAV file (daily only, no history API), paid vendors (Morningstar, Value Research, etc.).
- **Why:** it covers everything the brief needs at zero cost and is verified live. 
- **Weaknesses:** it is a community service with no guarantee of uptime. It also lists **dead schemes** that look normal: the HSBC debt fund first chosen had not updated since Nov 2022, and two peers were dead too. We now check freshness (prices must be recent) both in the verification script and when a fund is added. Mitigation: prices are saved in our own database, so a short outage never blanks the site.

## 2. Index data source and its reliability

- **Chose:** Yahoo Finance's chart endpoint (no key), cached in `index_history`.
- **Considered:** niftyindices.com (official but returned a web page, not data, to a server request), NSE endpoints (aggressive bot protection), paid market-data APIs.
- **Why:** it was the only free source that worked for four of five indexes from a server.
- **Weaknesses:** it is unofficial and could change or block us. Two gotchas found by testing: currency days are time-stamped 23:00 UTC the evening before (fixed by reading each market's own time zone), and **Nifty Smallcap 100 has no usable history** at all. We say so on the site and compare the small-cap fund with the Smallcap 250 (which it actually tracks). If Yahoo fails, we use saved closes and label the data with its date.

## 3. Category average from peer funds vs a paid benchmark

- **Chose:** the simple average of the returns of "similar funds": Direct Growth funds from other fund houses whose names share the same index or type (hand-picked for the five starter funds, found automatically for new ones), skipping any that fail to load.
- **Considered:** AMFI's official category averages (not available free as a time series), paid category benchmarks.
- **Why:** it is transparent ("average of 9 similar funds") and reproducible.
- **Weaknesses:** it is not an official category average; funds with different strategies could be mixed (we require the same scheme category), and the Large Cap slot has only 2 peers because few funds track the Nifty 50 with a fresh price. International peers are a judgement call (two Nasdaq 100 trackers plus US-equity funds). The debt fund has **no index**, so it is compared with its peers only, and we say that.

## 4. Deterministic code for numbers vs an LLM for narration

- **Chose:** all numbers computed in tested code; Gemini only writes sentences about numbers we hand it.
- **Considered:** letting the model read raw prices and do the maths.
- **Why:** LLMs make arithmetic mistakes and can invent figures; investors must be able to trust every number. We enforce this: the answer checker rejects any number that is not in the facts (it caught a rounding loophole in our first version), plus jargon, advice, extra sentences and headlines we did not provide.
- **Weakness:** the checker is strict and sometimes rejects acceptable wording, which costs a retry; then the template takes over.

## 5. Gemini Flash vs a larger model (and how we reach it)

- **Chose:** Gemini Flash models only (exam rule), `google/gemini-3.7-flash` first and `google/gemini-3.8-flash` as backup, reached through the **OpenRouter** gateway and pinned to Google's own servers (`provider: only google-vertex / google-ai-studio, no fallbacks`). The code refuses to start if any model id does not begin with `google/`.
- **Considered:** a Pro-class model (about 3x the price); calling Google's free API directly; the cheapest model, `google/gemini-3.5-flash-lite`.
- **Why Flash:** the task is explaining a handful of numbers; Flash is fast and cheap (about 1 US cent per report, 35–40 seconds for the whole weekly job), and the validation layer protects quality.
- **Why a gateway and not Google's free tier:** the direct free tier allows only **20 requests per day per model** and returned "high demand" (503) errors intermittently; testing used the day's quota in an hour. Through OpenRouter the same models are billed per use with generous limits, and the call has retries (3 times with backoff, honouring `Retry-After`), a model fallback, and a clean stop on "out of credits" (HTTP 402).
- **Experiment we ran:** the same real report written by the cheapest model (`gemini-3.5-flash-lite`, about $0.002–0.005) and by `gemini-3.7-flash` (about $0.011). The cheap model passed every automatic check but attached unrelated headlines to the numbers as if they were the cause ("as noted in ..."), which is misleading in a money app, and needed a retry. We kept 3.7-flash, which says plainly when the headlines do not explain a move. Cost difference: under a cent a week.
- **Weaknesses:** it adds a third-party gateway (one more thing that can be down; the template covers that) and a small running cost. The automatic checks cannot judge whether a quoted headline is relevant; the prompt asks the model to say "I don't know" in that case and the experiment above shows the larger model does.

## 6. Structured JSON output, validated, with a template fallback

- **Chose:** a strict JSON schema (sent with `require_parameters`, so it is never routed to an endpoint that would ignore it) + our own validator + one retry that tells the model what was wrong + a code-written template.
- **Considered:** free text; trusting the schema alone.
- **Why:** a schema guarantees shape, not truth. Our validator checks truth-like properties: every number must come from the facts and be rounded to one decimal, no minus signs or jargon, no advice, exactly three sentences, only supplied headlines quoted, and the market's share of the move must be stated. The database refuses any verdict that is not one of the three exact strings. The validator was tightened twice after reading real model output (a rounding loophole; a cheap model skipping the market-vs-fund split).
- **Weakness:** the template is dry. It is the safety net, not the goal; the report records which writer was used.

## 7. Supabase with server-only access and RLS vs client-side access

- **Chose:** RLS on with no public policies; only server code using the service-role key reads and writes.
- **Considered:** letting the browser query Supabase with the public key and writing policies.
- **Why:** the app has one user and a few admin actions; keeping the database closed removes a whole class of mistakes and leaks.
- **Weakness:** every read goes through our servers (a little slower, more code), and the service-role key is powerful, so it must never reach the browser (it is only in server environment variables).

## 8. Vercel Cron limits and how jobs are batched

- **Chose:** two cron jobs: a daily price job (07:00 IST) and a Saturday report job (07:30 IST), declared in `vercel.json` (schedules are in UTC).
- **Considered:** one cron per fund; hourly refresh.
- **Why:** the free Hobby plan allows few cron jobs, at most daily. Two jobs fit. Each job handles all funds, with limited parallelism (3–5 requests at a time) to be polite to free APIs and finish inside the function time limit (weekly job: about 30–60 s).
- **Weaknesses:** Hobby cron timing is approximate (it may run within the hour, not on the minute). The daily job also heals any missed days of the last week because it re-saves a week of overlap. Limits of the plan should be re-checked when deploying.

## 9. GNews with an RSS fallback

- **Chose:** GNews first (structured, dated, 2 requests a week against ~100/day), automatic fallback to Google News RSS (no key).
- **Considered:** RSS only; a paid news API.
- **Why:** if GNews errors, is rate-limited or the key lapses, the Saturday report must still happen. The report records which source was used.
- **Weaknesses:** a search can pull in off-topic stories (we saw a protest headline), so a relevance filter keeps only market and economy headlines. Headlines can only *suggest* why markets moved; the writer is told to say "I don't know" when they do not clearly explain a move.

## 10. Storing weekly snapshots vs recomputing history

- **Chose:** store each week's numbers (returns, gaps, split, status, streak, summary) in `weekly_snapshots`.
- **Considered:** recomputing past weeks from price history on demand.
- **Why:** a snapshot is what Meera *was told* that week; recomputing later would change history if data is corrected. It also makes the "weeks behind in a row" streak and the trend chart cheap.
- **Weakness:** a fix to the maths does not rewrite past snapshots (a deliberate choice; re-running the same week does update that week).

## 11. Idempotent jobs

- **Chose:** every write is an upsert on a unique key; a "run in progress" guard stops accidental double runs; every run is logged in `pipeline_runs`.
- **Why:** re-running never duplicates data (verified: after two weekly runs there is still one report and five snapshots for the week).
- **Weakness:** the guard is a database check, so two runs started in the same instant could both pass it; the upserts still keep the data clean.

## 12. Price indexes vs total-return funds

- **Chose:** compare each fund with the index's plain price level.
- **Considered:** total-return indexes (which include dividends).
- **Why:** price levels are what the free source provides.
- **Weakness:** fund prices include reinvested dividends, so over longer windows a fund can look slightly ahead of its index (about 0.7 points year-to-date for the Nifty 50 fund) without really outperforming. Week and month comparisons are barely affected. Stated in the README.

## 13. Matching dates, not guessing them

- **Chose:** compare the index and peers over the *fund's own* start and end dates.
- **Why:** with independently chosen dates a Nifty 50 index fund looked 1.3 points off its index purely because the index had one extra trading day. On matched dates the gap is 0.00.
- **For the US fund (Nasdaq):** converted to rupees, and tested against the fund's real prices rather than assumed. My first assumption (the NAV dated D reflects the US close of D minus 1) was based on one date and was **wrong**: over 188 Saturdays since March 2023, same-day matching fits better (month error 1.33% vs 1.43%; 14% vs 24% of weeks off by more than 1.5%). Even the best alignment leaves about 1.3% of monthly noise, which is the fund's own timing, not performance. See decision 16.

## 14. Saturday email via Resend

- **Chose:** Resend's HTTP API (free: 3,000 emails a month, 100 a day; one email a week is far inside that), called with plain `fetch`, sent from the Saturday job right after the report is saved.
- **Considered:** SMTP with a Gmail account (fragile, app passwords), SendGrid/Mailgun (more setup), sending from the browser (no).
- **Safety:** the week is claimed in an `email_log` table with a unique index before sending, plus Resend's `Idempotency-Key` header, so a re-run, a retry or two simultaneous jobs can never send the same week twice. If the log cannot be read, nothing is sent (better no email than a duplicate). A failed email never fails the saved report; it is recorded and shown. "Update now" never emails; only the scheduled job does, and a separate clearly marked test button exists.
- **Content:** the email is a detailed report of the whole week (glance table, why the markets moved with clickable sources, per-fund story and long-term returns, every headline read), not a three-liner. News reasons are worded as "fits" or "may have pushed", because headlines cannot prove a cause; the validator forces line 3 of every fund to quote a real fetched headline when the market moved.
- **Weaknesses:** without a verified domain Resend only delivers to the owner's own address (the code explains this in plain words when Resend refuses); Hobby cron timing is approximate, so "Saturday 7:30" can arrive within the hour; email clients render HTML differently, so the layout is simple tables with inline styles and a plain-text version is included.

## 15. Five years of history by replaying the same code

- **Chose:** compute past weekly snapshots from the stored price histories using the very same functions as a live Saturday (`computeFundSnapshots`), writing only weeks before the first real report and only numbers (no written summary).
- **Considered:** waiting for weeks to accumulate (the trend chart would be empty at submission); hand-entering history (error-prone).
- **Why:** it makes the trend chart real from day one, is repeatable (upserts; verified 1,249 rows after two runs), and cannot overwrite a real report.
- **Weaknesses:** the replay uses today's thresholds and today's list of similar funds (funds that did not yet exist are skipped, and the similar-funds average only includes those with history), so past statuses are "what today's rules would have said", not what was shown at the time.

## 16. A tolerance for funds that follow their index loosely

- **Chose:** `trackingAllowance` per index in `src/lib/config.ts`: 0 for Indian index funds (they copy their index within about 0.05%), 1.5 percentage points for the US fund. It widens the traffic-light thresholds and the "behind this week" test by that amount.
- **Why:** without it the US fund showed 47 amber and 4 red weeks over five years, mostly timing noise rather than performance, which would make Meera worry for no reason. With it: 198 green, 3 isolated amber, 4 not-enough-data weeks.
- **Weakness:** it is a judgement call (set from the measured noise, about 1.3% a month), and it makes the light slower to turn amber for that one fund. It is documented in the config, the README and here.
