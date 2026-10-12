import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import AskBox from "@/components/AskBox";
import FundCard from "@/components/FundCard";
import IndexStrip from "@/components/IndexStrip";
import MarketStory from "@/components/MarketStory";
import NewsList from "@/components/NewsList";
import ShareCard from "@/components/ShareCard";
import TrendSection from "@/components/TrendSection";
import VerdictBanner from "@/components/VerdictBanner";
import { istToday, weekEndingFor } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { slotRank } from "@/lib/funds";
import { getLatestReport, getNavSeries, getSnapshots } from "@/lib/queries";
import { addDays, daysBetween } from "@/lib/returns";

function Skeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your check-up">
      <div className="h-44 animate-pulse rounded-2xl bg-card-2" />
      <div className="h-24 animate-pulse rounded-2xl bg-card-2" />
      {[0, 1].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-card-2" />)}
    </div>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section role="alert" className="themed rounded-2xl border border-line bg-card p-6 shadow-card">
      <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-2 space-y-2 text-[15px] text-ink-2">{children}</div>
    </section>
  );
}

async function Dashboard() {
  await connection(); // today's date is read below, so this page is always built fresh
  let loaded;
  try {
    loaded = await getLatestReport();
  } catch {
    return (
      <Problem title="We could not load your check-up just now">
        <p>Your saved information is safe. Please try again in a minute.</p>
      </Problem>
    );
  }
  if (!loaded) {
    return (
      <Problem title="Your first check-up is not ready yet">
        <p>It is created every Saturday morning. To make one right now, open <Link href="/manage" className="font-semibold text-accent underline">My funds</Link> and press &ldquo;Update now&rdquo;.</p>
      </Problem>
    );
  }

  const { report } = loaded;
  const funds = [...report.funds].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const [priceSets, snapshots] = await Promise.all([
    Promise.all(funds.map((f) => getNavSeries(f.schemeCode, 200).catch(() => []))),
    getSnapshots().catch(() => []),
  ]);
  const dataAsOf = funds.map((f) => f.asOf).sort().pop() ?? report.weekEnding;
  const age = daysBetween(report.weekEnding, istToday());
  const today = istToday();
  const nextReport = weekEndingFor(today) === today ? today : addDays(weekEndingFor(today), 7);

  return (
    <div className="space-y-8">
      {age > 9 && (
        <p role="status" className="rounded-xl border border-line bg-warn-soft px-4 py-3 text-sm text-warn">
          This is last week&apos;s report (week ending {fmtDate(report.weekEnding)}). A fresh one is made every Saturday morning.
        </p>
      )}
      <VerdictBanner report={report} dataAsOf={dataAsOf} />
      <Link href="/report" className="themed flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-4 shadow-card hover:bg-card-2">
        <span>
          <span className="block text-[15px] font-bold">Read the full weekly report</span>
          <span className="block text-sm text-ink-2">The whole week in one page: markets, news, every fund. Emailed to you every Saturday morning. Next report: <strong className="text-ink">{fmtDate(nextReport)}</strong>, 7:30 am.</span>
        </span>
        <span aria-hidden="true" className="text-xl text-accent">&rarr;</span>
      </Link>
      <section aria-labelledby="funds-title">
        <h2 id="funds-title" className="text-lg font-bold tracking-tight">Your funds, in plain words</h2>
        <p className="mt-1 text-sm text-ink-2">Three short lines for each fund. Tap a fund to see its whole history.</p>
        <div className="mt-3 space-y-4">
          {funds.map((f, i) => <FundCard key={f.schemeCode} fund={f} prices={priceSets[i]} />)}
        </div>
      </section>
      <AskBox />
      <Link href="/manage" className="themed flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-4 shadow-card hover:bg-card-2">
        <span>
          <span className="block text-[15px] font-bold">Add or remove a fund</span>
          <span className="block text-sm text-ink-2">Search by name or paste a scheme code. No code changes needed (passcode protected).</span>
        </span>
        <span aria-hidden="true" className="text-xl text-accent">&rarr;</span>
      </Link>
      <IndexStrip moves={report.marketContext.indexMoves} />
      <MarketStory market={report.marketContext} />
      <TrendSection funds={funds} snapshots={snapshots} />
      <NewsList news={report.marketContext.news} />
      <ShareCard report={report} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Dashboard />
    </Suspense>
  );
}
