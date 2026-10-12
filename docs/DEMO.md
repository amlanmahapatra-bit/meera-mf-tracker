# Demo script (3–4 minutes)

_Not needed for the exam any more (the Components Map is the required item); kept as an optional walkthrough. Draft. Screens marked **(UI)** depend on the dashboard and form, which are built in the next phase; update the wording once they exist. The owner records the video._

**Before recording:** open the live site, run "Run now" once so the newest report is on screen, keep a second tab on the Components Map, have the admin passcode ready (do not show it on screen).

| Time | Say | Show |
|---|---|---|
| 0:00–0:30 | **The problem and Meera.** "Meera is 28, has 5 SIPs, and finds fund reports full of jargon. She wants one calm page on Saturday morning telling her whether anything needs attention." | Landing screen **(UI)** |
| 0:30–1:15 | **Dashboard and verdict.** "The banner comes first: one of three fixed verdicts with a specific reason. Below, each fund has a traffic light that also uses an icon and a word, so it works without colour." | Verdict banner, five fund cards **(UI)** |
| 1:15–2:00 | **One fund card, explained.** Pick the Nasdaq fund. "The result is three short lines in everyday words. Underneath: the price, this week, last month and year so far; how it did against the market and similar funds, and the *market-or-fund* split." Open the fund page: pick 1 month, then 5 years on the price chart, hover a day, and point at the green **Outperforming** label. Show the "How it did over time" table. Hover a glossary word. | One card, the fund page with the chart ranges, a glossary tooltip |
| 2:00–2:40 | **Add a fund by name, live.** "No code change needed." Type part of a fund name, pick a Direct Growth result, accept the suggested slot and index, add. Then remove it. | Add/remove form with passcode **(UI)** |
| 2:40–3:10 | **Run the pipeline.** Press "Run now". "It saves prices, fetches headlines, computes everything, asks Gemini for words, validates the answer and stores the result." Show the run log (`/api/health`): every run is recorded. | "Run now" button and run log **(UI)** |
| 3:10–3:40 | **Architecture.** "Numbers come from tested code; Gemini only explains them, and its answer is checked. If Gemini is down, a template still writes the report." | `docs/COMPONENTS_MAP.md` diagram |
| 3:40–4:00 | **One trade-off, honestly.** "Gemini only explains numbers that code computed, and every answer is checked; a report costs about a cent. If Gemini is unavailable, a template still writes it. Also: Nifty Smallcap 100 has no free data, so we say so and use Smallcap 250." | `docs/TRADEOFFS.md` |

**If something goes wrong on camera:** a fund that shows "data as of 9 Oct" or a report marked "written by the built-in template" is the system behaving as designed (graceful fallback). Mention it, don't hide it.
