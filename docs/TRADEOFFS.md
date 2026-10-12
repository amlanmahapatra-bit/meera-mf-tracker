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

## 5. Gemini Flash vs a larger model

- **Chose:** Gemini Flash models only (exam rule), newest first, falling back to older Flash models.
- **Considered:** a Pro-class model.
- **Why:** the task is explaining a handful of numbers; Flash is fast, cheap and good enough, and the validation layer protects quality.
- **Weaknesses found by experience:** the **free tier allows only 20 requests per day per model**, and models returned "high demand" (503) intermittently. Both are handled: cycling through models, a 55-second cap, stopping at a daily limit, and a template fallback so the report always exists. Our weekly job needs about 1–2 requests, so production use is comfortably inside the limit; heavy testing is not. The chat feature (if built) must be rate-limited for this reason.

## 6. Structured JSON output, validated, with a template fallback

- **Chose:** response schema + our own validator + one retry that tells the model what was wrong + a code-written template.
- **Considered:** free text; trusting the schema alone.
- **Why:** a schema guarantees shape, not truth. Our validator checks truth-like properties (numbers, sentences, verdict strings), and the database refuses any verdict that is not one of the three exact strings.
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

## 12. Matching dates, not guessing them

- **Chose:** compare the index and peers over the *fund's own* start and end dates.
- **Why:** with independently chosen dates a Nifty 50 index fund looked 1.3 points off its index purely because the index had one extra trading day. On matched dates the gap is 0.00.
- **Extra for the US fund:** the Nasdaq is converted to rupees and paired with the US close a NAV actually reflects (the NAV dated 9 Oct uses the 8 Oct US close and the 9 Oct rupee rate). A small week-level difference remains (the fund uses its own exchange-rate timing).
