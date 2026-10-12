# Saturday report schedule

Generated on Mon, 12 Oct 2026 by `npm run schedule`. Every Saturday at **07:30 am India time** (02:00 UTC, set in `vercel.json`) Trackerr builds
that Saturday's report and emails it, with the PDF attached, to the address in `REPORT_EMAIL_TO`.

- The report always belongs to **the Saturday it is sent on** (a Saturday run reports that same Saturday, never the week before).
- Fund prices and index closes are published after each trading day, so a Saturday morning report contains data **up to Friday**. Nothing is ever shown for a day that has not happened or been published yet.
- The daily job (07:00 am IST, every day) keeps the latest prices saved, so the site always shows the newest prices available.
- **Safety net:** if a Saturday email did not go out, the daily job re-sends it on Sunday, Monday or Tuesday (it never sends twice).

| # | Saturday | Sent at | Report covers | Data cut-off |
|---|---|---|---|---|
| 1 | **Sat, 17 Oct 2026** | 07:30 am IST | Week ending Sat, 17 Oct 2026 | Prices up to Fri, 16 Oct 2026 |
| 2 | **Sat, 24 Oct 2026** | 07:30 am IST | Week ending Sat, 24 Oct 2026 | Prices up to Fri, 23 Oct 2026 |
| 3 | **Sat, 31 Oct 2026** | 07:30 am IST | Week ending Sat, 31 Oct 2026 | Prices up to Fri, 30 Oct 2026 |
| 4 | **Sat, 7 Nov 2026** | 07:30 am IST | Week ending Sat, 7 Nov 2026 | Prices up to Fri, 6 Nov 2026 |
| 5 | **Sat, 14 Nov 2026** | 07:30 am IST | Week ending Sat, 14 Nov 2026 | Prices up to Fri, 13 Nov 2026 |
| 6 | **Sat, 21 Nov 2026** | 07:30 am IST | Week ending Sat, 21 Nov 2026 | Prices up to Fri, 20 Nov 2026 |
| 7 | **Sat, 28 Nov 2026** | 07:30 am IST | Week ending Sat, 28 Nov 2026 | Prices up to Fri, 27 Nov 2026 |
| 8 | **Sat, 5 Dec 2026** | 07:30 am IST | Week ending Sat, 5 Dec 2026 | Prices up to Fri, 4 Dec 2026 |
| 9 | **Sat, 12 Dec 2026** | 07:30 am IST | Week ending Sat, 12 Dec 2026 | Prices up to Fri, 11 Dec 2026 |
| 10 | **Sat, 19 Dec 2026** | 07:30 am IST | Week ending Sat, 19 Dec 2026 | Prices up to Fri, 18 Dec 2026 |
| 11 | **Sat, 26 Dec 2026** | 07:30 am IST | Week ending Sat, 26 Dec 2026 | Prices up to Fri, 25 Dec 2026 |
| 12 | **Sat, 2 Jan 2027** | 07:30 am IST | Week ending Sat, 2 Jan 2027 | Prices up to Fri, 1 Jan 2027 |
| 13 | **Sat, 9 Jan 2027** | 07:30 am IST | Week ending Sat, 9 Jan 2027 | Prices up to Fri, 8 Jan 2027 |
| 14 | **Sat, 16 Jan 2027** | 07:30 am IST | Week ending Sat, 16 Jan 2027 | Prices up to Fri, 15 Jan 2027 |
| 15 | **Sat, 23 Jan 2027** | 07:30 am IST | Week ending Sat, 23 Jan 2027 | Prices up to Fri, 22 Jan 2027 |
| 16 | **Sat, 30 Jan 2027** | 07:30 am IST | Week ending Sat, 30 Jan 2027 | Prices up to Fri, 29 Jan 2027 |
| 17 | **Sat, 6 Feb 2027** | 07:30 am IST | Week ending Sat, 6 Feb 2027 | Prices up to Fri, 5 Feb 2027 |
| 18 | **Sat, 13 Feb 2027** | 07:30 am IST | Week ending Sat, 13 Feb 2027 | Prices up to Fri, 12 Feb 2027 |
| 19 | **Sat, 20 Feb 2027** | 07:30 am IST | Week ending Sat, 20 Feb 2027 | Prices up to Fri, 19 Feb 2027 |
| 20 | **Sat, 27 Feb 2027** | 07:30 am IST | Week ending Sat, 27 Feb 2027 | Prices up to Fri, 26 Feb 2027 |
| 21 | **Sat, 6 Mar 2027** | 07:30 am IST | Week ending Sat, 6 Mar 2027 | Prices up to Fri, 5 Mar 2027 |
| 22 | **Sat, 13 Mar 2027** | 07:30 am IST | Week ending Sat, 13 Mar 2027 | Prices up to Fri, 12 Mar 2027 |
| 23 | **Sat, 20 Mar 2027** | 07:30 am IST | Week ending Sat, 20 Mar 2027 | Prices up to Fri, 19 Mar 2027 |
| 24 | **Sat, 27 Mar 2027** | 07:30 am IST | Week ending Sat, 27 Mar 2027 | Prices up to Fri, 26 Mar 2027 |
| 25 | **Sat, 3 Apr 2027** | 07:30 am IST | Week ending Sat, 3 Apr 2027 | Prices up to Fri, 2 Apr 2027 |
| 26 | **Sat, 10 Apr 2027** | 07:30 am IST | Week ending Sat, 10 Apr 2027 | Prices up to Fri, 9 Apr 2027 |
