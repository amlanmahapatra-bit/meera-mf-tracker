# Submission answers (copy into the form)

**1. Components Map image** &mdash; upload `docs/components-map.png` (0.7 MB) or `docs/components-map.pdf` (0.2 MB). One file only.

**2. GitHub repo (public)** &mdash; https://github.com/amlanmahapatra-bit/meera-mf-tracker

**3. Vercel link (deployed and tested)** &mdash; https://trackerr-amlan-mahapatra-1955.vercel.app

**4. Additional context (optional)** &mdash; paste this:

> Trackerr is a weekly mutual-fund check-up for "Meera", written in plain words. Live data: fund prices from mfapi.in, index levels from Yahoo Finance, headlines from GNews (automatic Google News RSS backup). All numbers are computed by tested code; Gemini Flash (via OpenRouter, Google models only) only explains them, and its output is validated (no invented numbers, jargon, advice or made-up headlines) with a template fallback. Weekly snapshots (5 years of weeks) are stored in Supabase. Meera can add/remove a fund from the web form with no code changes (passcode protected). Every Saturday 07:30 IST a Vercel Cron job builds the week's report and emails it with a PDF (a safety net re-sends a missed email). There is also an "Ask about my money" chat. Honest limits: the debt fund has no free benchmark (compared with similar funds only) and Nifty Smallcap 100 has no free data (Smallcap 250 used). Docs: README, docs/COMPONENTS_MAP.md, docs/TRADEOFFS.md, docs/REQUIREMENTS.md (checklist), docs/SCHEDULE.md.
