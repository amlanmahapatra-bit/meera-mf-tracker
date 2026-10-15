import { VERDICTS } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import type { ReportJson } from "@/lib/report-types";

const TONE = {
  [VERDICTS.none]: { bg: "bg-good-soft", fg: "text-good", icon: "check" },
  [VERDICTS.watch]: { bg: "bg-warn-soft", fg: "text-warn", icon: "eye" },
  [VERDICTS.review]: { bg: "bg-bad-soft", fg: "text-bad", icon: "flag" },
} as const;

/** The first thing Meera reads: one of three fixed verdicts, a specific reason, and where the words came from. */
export default function VerdictBanner({ report, dataAsOf, reportAsOf }: { report: ReportJson; dataAsOf: string; reportAsOf: string }) {
  const tone = TONE[report.verdict] ?? TONE[VERDICTS.none];
  const ai = report.writer.kind === "gemini";
  return (
    <section aria-labelledby="verdict-title" className={`themed rounded-2xl border border-line ${tone.bg} p-5 sm:p-7`}>
      <p className="text-sm font-semibold text-ink-2">Your check-up for the week ending {fmtDate(report.weekEnding)}</p>
      <div className="mt-2 flex items-start gap-3">
        <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card ${tone.fg}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tone.icon === "check" && <path d="M5 12.5l4.5 4.5L19 7.5" />}
            {tone.icon === "eye" && (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></>)}
            {tone.icon === "flag" && <path d="M6 21V4m0 0h11l-2 4 2 4H6" />}
          </svg>
        </span>
        <div>
          <h1 id="verdict-title" className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{report.verdict}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{report.verdictReason}</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-3">
        Latest prices as of {fmtDate(dataAsOf)}.{dataAsOf > reportAsOf ? ` This check-up uses prices up to ${fmtDate(reportAsOf)} and is refreshed every Saturday.` : ""}{" "}
        {ai ? "Words written by Google Gemini and checked against the numbers." : "Words written by our built-in template, because the AI writer was not available this time."}
      </p>
    </section>
  );
}
