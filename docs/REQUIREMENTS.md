# Requirements tracker ("the Bible")

Every instruction in `CLAUDE.md`, with its real status. Updated as work lands.
Legend: ✅ done and verified · 🟡 built, one part still to verify or finish · ⏳ not started yet (planned) · ➖ deliberately not done (reason given)

_Last updated: after build steps 1–9, the OpenRouter switch, and the first UI round (dashboard, fund pages, share, manage, how it works)._

## 1. Hard rules from the exam

| # | Rule | Status | Evidence / where |
|---|---|---|---|
| 1 | All AI tasks use **Gemini Flash**; never the Claude/Anthropic API | ✅ | `src/lib/gemini.ts` calls only OpenRouter with `google/` models (code refuses non-Google ids), pinned to Google's servers; no AI SDK installed; tests assert no Anthropic/OpenAI/Google-direct URL. **Live report verified**: `google/gemini-3.7-flash`, about $0.012 per report, stored in `weekly_reports` (`writer.kind = gemini`). |
| 2 | Use **live external data** | ✅ | mfapi.in, Yahoo Finance, GNews / Google News RSS, all verified with real requests (`npm run verify`). |
| 3 | Deploy on **Vercel**; deliver public URL + GitHub repo + Components Map | ⏳ | Repo ✅ (pushed). Components Map ✅ draft in `docs/`. Vercel project + public URL ⏳. |
| 4 | Weekly snapshots in **Supabase** | ✅ | `weekly_snapshots` written by `src/lib/pipeline/weekly.ts`; idempotent (verified: re-run leaves 5 rows). |
| 5 | Meera can **add/remove a fund** from a web form, no code changes | ✅ | Form at `/manage` (`src/components/ManagePanel.tsx`): passcode, search by name or paste a code, suggested slot/index, add, remove with confirmation. Tested in a real browser (wrong/right passcode, search, preview); the add and remove calls were tested end to end earlier against the live database. |
| 6 | Secrets only in env vars; `.env.local` in `.gitignore` | ✅ | `.gitignore` has `.env*` (+ `!.env.example`); verified with `git check-ignore`; `git ls-files` contains no env file. |

## 2. Data sources (verify each with a real request)

| Item | Status | Notes |
|---|---|---|
| NAV: mfapi.in (full history, latest, search) | ✅ | Verified. Dates `DD-MM-YYYY` parsed; weekend fallback tested. Found and replaced a **dead debt fund** (HSBC, last price Nov 2022) and 2 dead peers. |
| Index prices | ✅ | Yahoo chart API for Nifty 50, Midcap 150, Smallcap 250, Nasdaq 100 (+ USD→INR). Closes cached in `index_history`; cache is the fallback. |
| Nifty **Smallcap 100** (required by the brief) | ➖ | No free source gives history (Yahoo returns 1 price; niftyindices.com returns a web page). Stated on the site (`src/lib/notices.ts`) and to be stated in the README. Small-cap fund compared with Smallcap 250 instead. |
| News: GNews + automatic Google News RSS fallback | ✅ | Both verified live. Fallback is automatic and the source used is recorded in the report. |
| Check provider limits | ✅ | Google's direct free tier = 20 requests/day/model (hit during testing, so the AI step now goes through OpenRouter: about 1 cent per report). GNews ≈ 100/day, we use 2/week. Vercel cron declared in `vercel.json`; Hobby limits to be re-checked when deploying. |

## 3. Core logic (code, not AI)

| # | Rule | Status | Where |
|---|---|---|---|
| 1 | Returns: week, month, year-to-date; nearest EARLIER date | ✅ | `src/lib/returns.ts` (26 tests, 2 deliberate-bug checks) |
| 2 | Benchmark comparison, same windows; gap = fund − benchmark | ✅ | `src/lib/comparison.ts`; compares on the **fund's own dates** (fixed a false +0.9-point gap this way) |
| 3 | Category average from `peer_codes`; state the method; skip failed peers and report count | ✅ | `averagePeerReturns`, `peerAverageMatched`; "average of N similar funds" in every sentence |
| 4 | Debt fund: compare with category average only; never fake a benchmark | ✅ | `reference: "category"`; notice in `src/lib/notices.ts` |
| 5 | "Market or fund?" split | ✅ computed · ⏳ displayed | `Split` in `comparison.ts`; also written into report sentences; stored in `market_part_1w` / `fund_part_1w` |
| 6 | Status green/amber/red from documented thresholds + `weeks_lagging`; thresholds in ONE config file | ✅ | `src/lib/config.ts` (`STATUS_RULES`), `src/lib/status.ts` |
| 7 | Candidate verdict computed in code, passed to Gemini as a suggestion | ✅ | `candidateVerdict`; Gemini may adjust but never calmer than a red fund |

Extra care added: US fund (Nasdaq) is converted to rupees and lined up with the US close the NAV reflects.

## 4. Gemini usage

| Rule | Status |
|---|---|
| Single structured call per weekly report, JSON + strict schema | ✅ verified live (1 call, ~38 s whole job) |
| Input: computed numbers, index moves, top headlines, last weeks' status, candidate verdict | ✅ `buildFacts` |
| Validate with a schema, **retry once**, then **fall back to a template** | ✅ retry seen live (cheap model needed one); template fallback seen working live and tested for 402/429/5xx |
| Per fund exactly **three plain sentences** (performance / comparison / events citing only provided headlines) | ✅ enforced by the checker |
| Overall verdict = one of the 3 exact strings + one-sentence specific reason | ✅ checker + database CHECK constraint (verified: bad value rejected) |
| Prompt rules: no jargon, no invented numbers, no advice, calm, "I don't know" | ✅ prompt + checker (numbers, jargon list, advice list, quoted headlines) |
| Optional Hinglish toggle (same call with a language flag) | 🟡 prompt supports it; endpoint/toggle ⏳ |

## 5. Features

**Must have**

| # | Feature | Status |
|---|---|---|
| 1 | Daily cron: latest NAV for active funds → `nav_history` | ✅ route + job tested; `vercel.json` ⏳ live on Vercel |
| 2 | Saturday cron: context, snapshots, Gemini, save to `weekly_snapshots` + `weekly_reports` | ✅ tested end to end live (status `success`) |
| 3 | Dashboard: report, verdict banner, traffic-light cards, market-vs-fund split, 3 sentences, multi-week trend chart | ✅ `src/app/page.tsx` + `FundCard`, `VerdictBanner`, `SplitBar`, `TrendSection`. First round shown to the owner; polish continues from their comments. Trend chart fills in as weeks accumulate (1 week saved so far). |
| 4 | Add/remove fund form: search by NAME (Direct + Growth only), or paste code; validate, backfill, suggest slot/benchmark, find peers; remove = `active=false`; `ADMIN_PASSCODE` | ✅ `/manage` |
| 5 | "Run now" so the site has real data | ✅ `/api/admin/run` (verified: 63 s, double-run guard works) · "Update now" button on `/manage` with progress and result |
| 6 | Graceful failures: last good data + "data as of" note, never a blank crash | ✅ backend cache fallback · on screen: "prices as of", per-fund fallback notes, "last week's report" notice, loading skeletons, error and empty states (`error.tsx`, `not-found.tsx`) |

**Standout** (after the must-haves work end to end)

| # | Feature | Status |
|---|---|---|
| 7 | "Send to my CA" WhatsApp button (`wa.me/?text=`) | ✅ dashboard card, each fund page, and `/share` (WhatsApp, email, copy, CSV, print/PDF); message lists every fund's name, scheme code, NAV, date and returns (`src/lib/share.ts`, tested) |
| 8 | "Ask about my money" chat (answers only from stored data + headlines) | ⏳ (each question costs about a cent; add a daily cap) |
| 9 | English / Hinglish toggle | 🟡 prompt ready · toggle ⏳ (lowest priority) |
| 10 | Saturday email delivery | ⏳ (lowest priority; needs a free email service, ask first) |

## 6. Build order

| Step | Status |
|---|---|
| 1 Scaffold, Supabase client, env, `.gitignore` | ✅ |
| 2 Data-source verification script | ✅ (`npm run verify`, 21 checks incl. OpenRouter) |
| 3 Returns engine + tests | ✅ |
| 4 Index data + benchmark/category comparison | ✅ |
| 5 Pipeline: snapshots, status, verdict | ✅ |
| 6 Gemini report with validation + fallback | ✅ verified live |
| 7 Dashboard UI | ✅ first round (light + dark mode, mobile-friendly); refining with the owner's comments |
| 8 Add/remove fund flow | ✅ |
| 9 Cron routes + `vercel.json` | ✅ code · ⏳ live |
| 10 Standout features | ⏳ |
| 11 `docs/COMPONENTS_MAP.md` (+ PNG/PDF), README | ✅ written and exported; final pass after UI |

## 7. Definition of done

| Item | Status |
|---|---|
| Public Vercel URL shows a real weekly report with real numbers | ⏳ (a real report is already in the database) |
| Add/remove a fund from the form without code | ✅ |
| Cron routes configured and secured; first run done manually | ✅ secured and configured · manual run ✅ locally · ⏳ on Vercel |
| No secrets in the repo | ✅ |
| `docs/COMPONENTS_MAP.md` (+ PNG/PDF), `docs/TRADEOFFS.md`, `docs/DEMO.md`, README in the repo | ✅ all present (`docs/components-map.png` and `.pdf` exported); DEMO and map get a final polish after the UI |
| Tests pass, jobs idempotent, `pipeline_runs` shows successful runs | ✅ 118 tests · idempotent (verified) · `pipeline_runs` logs every run (see `/api/health`); weekly runs now show `success`. A run shows **partial** only when a fallback was used (by design). |
| Known limitations stated honestly in the README | ✅ |

## 8. Examiner's rubric

| Component | Weight | Status |
|---|---|---|
| Backend logic & build quality | 25% | ✅ strong: staged pipeline, idempotent upserts, timeouts/retries/fallbacks, validation, 105 tests, `pipeline_runs` |
| Components Map | 10% | ✅ Mermaid diagram + full component table + PNG and PDF export |
| Working Vercel link | 10% | ⏳ |
| Design | 10% | 🟡 first round built: calm light-blue palette, light/dark toggle, accessible traffic lights (icon + word), validated chart colours; refining with owner feedback |
| Demo video | 5% | ⏳ script drafted in `docs/DEMO.md`; owner records |
| `docs/TRADEOFFS.md` | assessed | ✅ drafted, covers every topic the brief lists |

## 9. Quality bar

| Item | Status |
|---|---|
| Reliability first (timeouts, retries, fallbacks everywhere) | ✅ backend |
| Plain language everywhere + hover glossary | ✅ glossary tooltips (`Term`), plain report text |
| Honest numbers: computed in code, "data as of", method shown | ✅ computed and shown ("Average of N similar funds", "prices as of", comparison table, "Why this traffic light?") |
| "How this works" page on the site | ✅ `/how-it-works` |
| Tests for returns engine (weekend, year start, missing NAV, peer failures) | ✅ |
| Polish: mobile, loading/empty/error states, accessible colours (icons/text with traffic lights) | ✅ first round; verified in a real browser at desktop and phone width in both modes, production build passes |
| Security: cron needs `CRON_SECRET`, fund changes need `ADMIN_PASSCODE`, validate input | ✅ verified with real requests |
| Submission readiness: README with setup, env vars, architecture, limitations, checklist | ✅ draft |

## 10. Working style (from CLAUDE.md)

Explain in plain language ✔ · show real output, verify APIs before depending on them ✔ · ask before adding paid services or anything outside the brief ✔ (nothing paid added; the free Gemini limit is a risk, not a spend).
