/** Writes docs/SCHEDULE.md: every upcoming Saturday the report is made and emailed. Usage: npm run schedule [-- --weeks=26] */
import { writeFileSync } from "node:fs";
import { istToday, weekEndingFor } from "../src/lib/dates";
import { addDays } from "../src/lib/returns";

const weeks = Number(process.argv.find((a) => a.startsWith("--weeks="))?.split("=")[1] ?? 26);
const today = istToday();
const first = weekEndingFor(today) === today ? today : addDays(weekEndingFor(today), 7);
const nice = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const rows = Array.from({ length: weeks }, (_, i) => {
  const sat = addDays(first, i * 7);
  return `| ${i + 1} | **${nice(sat)}** | 07:30 am IST | Week ending ${nice(sat)} | Prices up to ${nice(addDays(sat, -1))} |`;
});

writeFileSync("docs/SCHEDULE.md", `# Saturday report schedule

Generated on ${nice(today)} by \`npm run schedule\`. Every Saturday at **07:30 am India time** (02:00 UTC, set in \`vercel.json\`) Trackerr builds
that Saturday's report and emails it, with the PDF attached, to the address in \`REPORT_EMAIL_TO\`.

- The report always belongs to **the Saturday it is sent on** (a Saturday run reports that same Saturday, never the week before).
- Fund prices and index closes are published after each trading day, so a Saturday morning report contains data **up to Friday**. Nothing is ever shown for a day that has not happened or been published yet.
- The daily job (07:00 am IST, every day) keeps the latest prices saved, so the site always shows the newest prices available.
- **Safety net:** if a Saturday email did not go out, the daily job re-sends it on Sunday, Monday or Tuesday (it never sends twice).

| # | Saturday | Sent at | Report covers | Data cut-off |
|---|---|---|---|---|
${rows.join("\n")}
`);
console.log(`Wrote docs/SCHEDULE.md with the next ${weeks} Saturdays, starting ${nice(first)}.`);
