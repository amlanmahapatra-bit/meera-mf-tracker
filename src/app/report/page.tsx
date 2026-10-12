import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PrintButton from "@/components/PrintButton";
import StandingLabel from "@/components/StandingLabel";
import StatusChip from "@/components/StatusChip";
import { fmtDate, fmtNav, fmtPct, toneClass } from "@/lib/format";
import { slotRank } from "@/lib/funds";
import { shortName } from "@/lib/present";
import { getLatestReport } from "@/lib/queries";
import { peerStanding, type Status } from "@/lib/status";

export const metadata: Metadata = { title: "Weekly report" };

const SOURCE_LABEL = { gnews: "GNews", google_news_rss: "Google News (backup source)", none: "no news source" } as const;
const LONG_TERM = ["6m", "1y", "3y", "5y"] as const;

function Pct({ v }: { v: number | null | undefined }) {
  return <span className={`font-semibold tabular-nums ${toneClass(v)}`}>{fmtPct(v)}</span>;
}

async function Report() {
  let loaded;
  try {
    loaded = await getLatestReport();
  } catch {
    return <p role="alert" className="themed rounded-2xl border border-line bg-card p-6 text-ink-2">We could not load the report just now. Please try again in a minute.</p>;
  }
  if (!loaded) {
    return <p className="themed rounded-2xl border border-line bg-card p-6 text-ink-2">There is no weekly report yet. The first one is made on Saturday, or you can make one from <Link href="/manage" className="font-semibold text-accent underline">My funds</Link>.</p>;
  }
  const { report } = loaded;
  const funds = [...report.funds].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const m = report.marketContext;

  return (
    <article className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">Weekly report &middot; week ending {fmtDate(report.weekEnding)}</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight">Your week in money</h1>
        <div className="themed mt-4 rounded-2xl border border-line bg-accent-soft p-5">
          <p className="text-xl font-extrabold tracking-tight">{report.verdict}</p>
          <p className="mt-1 text-[16px] leading-relaxed text-ink-2">{report.verdictReason}</p>
        </div>
        <div className="no-print mt-4 flex flex-wrap gap-2 text-sm">
          <PrintButton className="rounded-lg border border-line-strong bg-card px-3 py-1.5 font-semibold hover:bg-card-2" />
          <Link href="/" className="rounded-lg border border-line-strong bg-card px-3 py-1.5 font-semibold hover:bg-card-2">Back to this week</Link>
        </div>
      </header>

      <section aria-labelledby="glance">
        <h2 id="glance" className="text-lg font-bold tracking-tight">The week at a glance</h2>
        <div className="themed mt-3 overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <th scope="col" className="px-4 py-3 font-semibold">Fund</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Week</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Month</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Year so far</th>
                <th scope="col" className="px-4 py-3 font-semibold">How it is going</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.schemeCode} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="px-4 py-3 font-semibold leading-snug">{shortName(f.name)}<span className="block text-xs font-normal text-ink-3">{f.slot}</span></th>
                  <td className="px-4 py-3 text-right"><Pct v={f.comparison.fund.week} /></td>
                  <td className="px-4 py-3 text-right"><Pct v={f.comparison.fund.month} /></td>
                  <td className="px-4 py-3 text-right"><Pct v={f.comparison.fund.ytd} /></td>
                  <td className="px-4 py-3"><StatusChip status={f.status as Status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="markets">
        <h2 id="markets" className="text-lg font-bold tracking-tight">How the markets did, and why</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {m.indexMoves.map((x) => (
            <li key={x.name} className="themed rounded-xl border border-line bg-card p-4">
              <p className="text-xs font-semibold text-ink-3">{x.name}</p>
              <p className={`mt-1 text-xl font-extrabold tabular-nums ${toneClass(x.week)}`}>{fmtPct(x.week)}</p>
              <p className="text-xs text-ink-3">this week</p>
            </li>
          ))}
        </ul>
        <div className="themed mt-3 rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6">
          {(m.overview ?? []).length > 0 && <p className="text-[16px] leading-relaxed text-ink-2">{m.overview!.join(" ")}</p>}
          {(m.drivers ?? []).length > 0 && (
            <ul className="mt-5 space-y-4 border-t border-line pt-5">
              {m.drivers!.map((d) => (
                <li key={d.headline}>
                  <p className="text-[15px] leading-relaxed text-ink-2">{d.text}</p>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-semibold leading-snug text-accent hover:underline">
                    {d.headline} <span className="font-normal text-ink-3">&middot; {d.source}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="each">
        <h2 id="each" className="text-lg font-bold tracking-tight">Each fund, in detail</h2>
        <div className="mt-3 space-y-5">
          {funds.map((f) => {
            const c = f.comparison;
            const long = LONG_TERM.map((k) => f.periods?.find((p) => p.key === k)).filter((p) => p && p.pct !== null);
            return (
              <div key={f.schemeCode} className="themed break-inside-avoid rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{f.slot}</p>
                <h3 className="mt-1 text-xl font-extrabold leading-tight tracking-tight">
                  <Link href={`/funds/${f.schemeCode}`} className="hover:underline">{shortName(f.name)}</Link>
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <StatusChip status={f.status as Status} />
                  <StandingLabel standing={peerStanding(c.gapVsCategory.month, c.peersUsed)} />
                  <span className="text-xs text-ink-3">Price {fmtNav(f.nav)} as of {fmtDate(f.asOf)}</span>
                </div>
                <ol className="mt-4 space-y-1.5 border-l-4 border-accent bg-accent-soft px-4 py-3 text-[16px] leading-relaxed text-ink">
                  {f.sentences.map((s, i) => <li key={i} className="list-none">{s}</li>)}
                </ol>
                {f.detail && f.detail.length > 0 && <p className="mt-4 text-[16px] leading-relaxed text-ink-2">{f.detail.join(" ")}</p>}
                {long.length > 0 && (
                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    {long.map((p) => (
                      <div key={p!.key}>
                        <dt className="text-xs text-ink-3">{p!.label}</dt>
                        <dd><Pct v={p!.pct} />{p!.perYear !== null && <span className="text-xs text-ink-3"> ({fmtPct(p!.perYear)} a year)</span>}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {m.news.headlines.length > 0 && (
        <section aria-labelledby="news" className="break-inside-avoid">
          <h2 id="news" className="text-lg font-bold tracking-tight">Everything we read this week</h2>
          <p className="mt-1 text-sm text-ink-2">Source: {SOURCE_LABEL[m.news.source]}. Tap a headline to read the full story.</p>
          <ul className="themed mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {m.news.headlines.map((h) => (
              <li key={h.url || h.title}>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-card-2">
                  <span className="block text-[15px] font-semibold leading-snug">{h.title}</span>
                  <span className="block text-xs text-ink-3">{h.source}{h.publishedAt ? ` · ${fmtDate(h.publishedAt.slice(0, 10), false)}` : ""}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
        {m.notices.map((n) => <p key={n}>{n}</p>)}
        <p>{report.writer.kind === "gemini" ? "Words written by Google Gemini and checked against the numbers." : "Words written by our built-in template (the AI writer was not available this time)."} All figures are worked out by code from public price data. This is information to help you understand your funds, not investment advice.</p>
      </footer>
    </article>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card-2" aria-busy="true" aria-label="Loading the weekly report" />}>
      <Report />
    </Suspense>
  );
}
