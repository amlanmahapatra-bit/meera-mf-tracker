import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CopyButton from "@/components/ShareActions";
import PrintButton from "@/components/PrintButton";
import { fmtDate, fmtNav, fmtPct, toneClass } from "@/lib/format";
import { slotRank } from "@/lib/funds";
import { getLatestReport } from "@/lib/queries";
import { buildShareCsv, buildShareText, csvDataUri, mailtoLink, shareSubject, whatsappLink } from "@/lib/share";

export const metadata: Metadata = { title: "Send to my CA" };

const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-ink hover:opacity-90";
const btnSecondary = "inline-flex items-center justify-center rounded-xl border border-line-strong bg-card px-5 py-3 text-sm font-semibold text-ink hover:bg-card-2";

async function Share() {
  let loaded;
  try {
    loaded = await getLatestReport();
  } catch {
    return <p role="alert" className="themed rounded-2xl border border-line bg-card p-6 text-ink-2">We could not load your funds just now. Please try again in a minute.</p>;
  }
  if (!loaded) {
    return <p className="themed rounded-2xl border border-line bg-card p-6 text-ink-2">There is nothing to send yet. Your first check-up is created on Saturday, or you can make one from <Link href="/manage" className="font-semibold text-accent underline">My funds</Link>.</p>;
  }
  const { report } = loaded;
  const funds = [...report.funds].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const sorted = { ...report, funds };
  const text = buildShareText(sorted);
  const csv = buildShareCsv(sorted);

  return (
    <div className="space-y-8">
      <header className="no-print">
        <h1 className="text-3xl font-extrabold tracking-tight">Send your funds to your CA</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Your CA usually asks for each fund&apos;s price (NAV). Everything is below, ready to go. Nothing is sent until <em>you</em> pick your CA in WhatsApp or your email app.
        </p>
      </header>

      <section aria-label="Ways to send" className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer" className={btnPrimary}>Send on WhatsApp</a>
        <a href={mailtoLink(shareSubject(sorted), text)} className={btnSecondary}>Send by email</a>
        <CopyButton text={text} label="Copy message" className={btnSecondary} />
        <a href={csvDataUri(csv)} download={`my-funds-${report.weekEnding}.csv`} className={btnSecondary}>Download for Excel (CSV)</a>
        <PrintButton className={btnSecondary} />
      </section>

      <section aria-labelledby="table-title">
        <h2 id="table-title" className="text-lg font-bold tracking-tight">Your funds, week ending {fmtDate(report.weekEnding)}</h2>
        <div className="themed mt-3 overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <th scope="col" className="px-4 py-3 font-semibold">Fund</th>
                <th scope="col" className="px-4 py-3 font-semibold">Scheme code</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Price (NAV)</th>
                <th scope="col" className="px-4 py-3 font-semibold">As of</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Week</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Month</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Year so far</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.schemeCode} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="px-4 py-3 font-semibold leading-snug">{f.name}</th>
                  <td className="px-4 py-3 tabular-nums text-ink-2">{f.schemeCode}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{fmtNav(f.nav)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-2">{fmtDate(f.asOf)}</td>
                  {(["week", "month", "ytd"] as const).map((k) => (
                    <td key={k} className={`px-4 py-3 text-right font-semibold tabular-nums ${toneClass(f.comparison.fund[k])}`}>{fmtPct(f.comparison.fund[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">{report.verdict}. {report.verdictReason}</p>
      </section>

      <section aria-labelledby="preview-title" className="no-print">
        <h2 id="preview-title" className="text-lg font-bold tracking-tight">The message that will be sent</h2>
        <pre className="themed mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-line bg-card p-5 font-sans text-sm leading-relaxed text-ink-2 shadow-card">{text}</pre>
      </section>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card-2" aria-busy="true" aria-label="Loading" />}>
      <Share />
    </Suspense>
  );
}
