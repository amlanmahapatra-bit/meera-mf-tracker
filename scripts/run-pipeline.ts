/** Runs a pipeline job for real. Usage: npm run pipeline -- daily | weekly | both */
import { runDailyNav } from "../src/lib/pipeline/daily";
import { withRun } from "../src/lib/pipeline/run";
import { runWeekly } from "../src/lib/pipeline/weekly";

async function main() {
  const which = process.argv[2] ?? "both";
  if (which === "daily" || which === "both") {
    const t = Date.now();
    const r = await withRun("daily_nav", runDailyNav);
    console.log(`daily_nav -> ${r.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`, r.error ?? r.skipped ?? "");
    console.log(JSON.stringify(r.details, null, 1));
  }
  if (which === "weekly" || which === "both") {
    const t = Date.now();
    const r = await withRun("weekly_report", () => runWeekly());
    console.log(`weekly_report -> ${r.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`, r.error ?? r.skipped ?? "");
    console.log(JSON.stringify(r.details, null, 1));
  }
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
