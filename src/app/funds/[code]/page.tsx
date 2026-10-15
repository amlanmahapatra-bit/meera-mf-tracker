import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ComparisonTable from "@/components/ComparisonTable";
import CopyButton from "@/components/ShareActions";
import LineChart from "@/components/LineChart";
import SplitBar from "@/components/SplitBar";
import StandingLabel from "@/components/StandingLabel";
import StatusChip from "@/components/StatusChip";
import Term from "@/components/Term";
import { STATUS_RULES } from "@/lib/config";
import { fmtDate, fmtNav, fmtPct } from "@/lib/format";
import { latestPrice, shortName } from "@/lib/present";
import { getLatestReport, getNavSeries, getSnapshots } from "@/lib/queries";
import { periodReturns } from "@/lib/periods";
import PeriodTable from "@/components/PeriodTable";
import { buildShareText, whatsappLink } from "@/lib/share";
import { peerStanding, type Status } from "@/lib/status";

export const metadata: Metadata = { title: "Fund details" };

const RANGES = [
  { label: "1D", points: 2 }, { label: "1W", days: 7 }, { label: "1M", days: 30 }, { label: "6M", days: 182 },
  { label: "1Y", days: 365 }, { label: "3Y", days: 1096 }, { label: "5Y", days: 1826 }, { label: "All", days: null },
];

function Skeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading fund details">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-card-2" />
      <div className="h-40 animate-pulse rounded-2xl bg-card-2" />
      <div className="h-72 animate-pulse rounded-2xl bg-card-2" />
    </div>
  );
}

const g = STATUS_RULES.greenMinMonthGap, a = STATUS_RULES.amberMinMonthGap;
const abs1 = (n: number) => Math.abs(n).toFixed(0);

async function Detail({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const schemeCode = Number(code);
  if (!Number.isInteger(schemeCode)) notFound();

  let loaded;
  try {
    loaded = await getLatestReport();
  } catch {
    return (
      <section role="alert" className="themed rounded-2xl border border-line bg-card p-6 shadow-card">
        <h1 className="text-xl font-extrabold">We could not load this fund just now</h1>
        <p className="mt-2 text-ink-2">Please try again in a minute.</p>
      </section>
    );
  }
  const fund = loaded?.report.funds.find((f) => f.schemeCode === schemeCode);
  if (!loaded || !fund) notFound();

  const [prices, snaps] = await Promise.all([getNavSeries(schemeCode, 20000).catch(() => []), getSnapshots().catch(() => [])]);
  const periods = periodReturns(prices);
  const latest = latestPrice(prices, fund.nav, fund.asOf);
  const c = fund.comparison;
  const standing = peerStanding(c.gapVsCategory.month, c.peersUsed);
  const mine = snaps.filter((s) => s.schemeCode === schemeCode).sort((x, y) => (x.weekEnding < y.weekEnding ? 1 : -1));
  const shareText = buildShareText({ ...loaded.report, funds: [fund] });

  return (
    <div className="space-y-8">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"><span aria-hidden="true">&larr;</span> This week</Link>

      <header>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{fund.slot}</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight">{shortName(fund.name)}</h1>
        <p className="mt-1 text-sm text-ink-3">{fund.name} &middot; scheme code {fund.schemeCode}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusChip status={fund.status as Status} />
          <StandingLabel standing={standing} />
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-ink-3"><Term k="nav">Price (NAV)</Term> as of {fmtDate(latest?.date ?? fund.asOf)}{latest ? " (latest)" : ""}</p>
            <p className="text-4xl font-extrabold tracking-tight tabular-nums">{fmtNav(latest?.nav ?? fund.nav)}</p>
            {latest && latest.sinceReportPct !== null && <p className="mt-0.5 text-xs text-ink-3">{fmtPct(latest.sinceReportPct)} since the check-up on {fmtDate(fund.asOf)}</p>}
          </div>
          <div className="no-print flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-3">Optional:</span>
            <a href={whatsappLink(shareText)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line-strong bg-card px-3 py-1.5 font-semibold hover:bg-card-2">Share this fund on WhatsApp</a>
            <CopyButton text={shareText} label="Copy" className="rounded-lg border border-line-strong bg-card px-3 py-1.5 font-semibold hover:bg-card-2" />
          </div>
        </div>
      </header>

      <section aria-labelledby="happened">
        <h2 id="happened" className="text-lg font-bold tracking-tight">In plain words</h2>
        <div className="themed mt-3 space-y-3 rounded-2xl border border-line bg-card p-5 text-[16px] leading-relaxed text-ink-2 shadow-card sm:p-6">
          {fund.sentences.map((s, i) => <p key={i}>{s}</p>)}
          {c.split && <div className="pt-2"><SplitBar split={c.split} /></div>}
        </div>
      </section>

      {fund.detail && fund.detail.length > 0 && (
        <section aria-labelledby="story">
          <h2 id="story" className="text-lg font-bold tracking-tight">The full story of the week</h2>
          <div className="themed mt-3 space-y-2 rounded-2xl border border-line bg-card p-5 text-[16px] leading-relaxed text-ink-2 shadow-card sm:p-6">
            <p>{fund.detail.join(" ")}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="price">
        <h2 id="price" className="text-lg font-bold tracking-tight">Price history</h2>
        <p className="mt-1 text-sm text-ink-2">The price of one unit of this fund, day by day, from the day it started. Pick a period, then hover or touch the line to read any day.</p>
        <div className="themed mt-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
          <LineChart series={[{ id: "nav", label: shortName(fund.name), color: "var(--s1)", points: prices }]} unit="price" ariaLabel={`Price history of ${shortName(fund.name)}`} ranges={RANGES} defaultRange="1Y" valueHeader="Price (NAV)" />
        </div>
      </section>

      {periods && (
        <section aria-labelledby="over-time">
          <h2 id="over-time" className="text-lg font-bold tracking-tight">How it did over time</h2>
          <p className="mt-1 text-sm text-ink-2">Worked out from the fund&apos;s real daily prices, all the way back.</p>
          <div className="mt-3"><PeriodTable summary={periods} /></div>
        </section>
      )}

      <section aria-labelledby="compare">
        <h2 id="compare" className="text-lg font-bold tracking-tight">How it compares</h2>
        <p className="mt-1 text-sm text-ink-2">&ldquo;Better&rdquo; means your fund did better than what it is compared with over the same days.</p>
        <div className="mt-3"><ComparisonTable c={c} /></div>
        <p className="mt-2 text-xs text-ink-3">
          {c.peersUsed < c.peersRequested ? `${c.peersRequested - c.peersUsed} of ${c.peersRequested} similar funds could not be loaded and were skipped. ` : ""}
          Prices as of {fmtDate(fund.asOf)}.
        </p>
      </section>

      <section aria-labelledby="light">
        <h2 id="light" className="text-lg font-bold tracking-tight">Why this traffic light?</h2>
        <div className="themed mt-3 rounded-2xl border border-line bg-card p-5 text-[15px] leading-relaxed text-ink-2 shadow-card">
          <p>
            We look at how far the fund is from what it is compared with over the last month. <strong className="text-good">Green</strong>: no more than {abs1(g)}% worse.{" "}
            <strong className="text-warn">Amber</strong>: between {abs1(g)}% and {abs1(a)}% worse. <strong className="text-bad">Red</strong>: more than {abs1(a)}% worse.
            A fund that has trailed for {STATUS_RULES.amberWeeksLagging} weeks in a row is at least amber, and for {STATUS_RULES.redWeeksLagging} weeks in a row, red.
          </p>
          <p className="mt-3 font-semibold text-ink">
            {fund.weeksLagging > 0 ? `This fund has trailed what it is compared with for ${fund.weeksLagging} week${fund.weeksLagging === 1 ? "" : "s"} in a row.` : "This fund is not currently trailing what it is compared with."}
          </p>
        </div>
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="weeks">
          <h2 id="weeks" className="text-lg font-bold tracking-tight">Week by week</h2>
          <div className="themed mt-3 overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3"><th className="px-4 py-3 font-semibold">Week ending</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 text-right font-semibold">That week</th><th className="px-4 py-3 text-right font-semibold">Month to then</th></tr></thead>
              <tbody>
                {mine.slice(0, 12).map((s) => (
                  <tr key={s.weekEnding} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-3 font-medium">{fmtDate(s.weekEnding)}</th>
                    <td className="px-4 py-3"><StatusChip status={(s.status as Status) ?? "unknown"} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(s.week)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(s.month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mine.length > 12 && <p className="mt-2 text-xs text-ink-3">Showing the latest 12 of {mine.length} weeks.</p>}
        </section>
      )}

      {fund.dataNotes.length > 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{fund.dataNotes.join(" ")}</p>}
    </div>
  );
}

export default function FundPage({ params }: PageProps<"/funds/[code]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}
