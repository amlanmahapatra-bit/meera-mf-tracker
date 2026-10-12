import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";
import { PEER_STANDING, STATUS_RULES, VERDICTS } from "@/lib/config";
import { SMALLCAP_NOTICE } from "@/lib/notices";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  { title: "Every morning, we save the prices", body: "We collect each of your funds' latest price (NAV) and the closing score of the big market indexes, and keep our own copy. If a website is down, we use the copy and tell you its date." },
  { title: "Every Saturday morning, we do the sums", body: "A computer program, not an AI, works out how each fund did over the last week, the last month and since January. If a day has no price (weekends, holidays) it uses the closest earlier day." },
  { title: "We compare each fund fairly", body: "Each fund is compared with the market index it follows and with the average of similar funds. Both use the very same dates as your fund, so nothing is compared unfairly." },
  { title: "We split the week into “market” and “fund”", body: "If the market fell 1.9% and your fund fell 2.1%, then 1.9% of your drop was the whole market and 0.2% was the fund itself. That tells you whether to worry about the fund or just the market." },
  { title: "We read the week's headlines", body: "We pick the main market and economy news of the week (from GNews, or Google News if GNews is not working) so the explanation can mention what was going on." },
  { title: "Gemini writes it up in plain words", body: "Google's Gemini AI gets only the finished numbers and the headlines. It writes three short sentences per fund. It never does any maths." },
  { title: "Code checks every word", body: "Before anything is shown, the program rejects the AI's text if it invents a number, uses jargon, gives investment advice, or quotes a headline we did not give it. If the AI is unavailable, a simple built-in template writes the text instead, and the page says so." },
];

const LIMITS = [
  SMALLCAP_NOTICE,
  "There is no free market index for short-term debt funds, so that fund is compared only with similar funds.",
  "“Similar funds” is our own method: the average of comparable funds from other companies. It is not an official category figure.",
  "Index scores do not include dividends but fund prices do, so over longer periods a fund can look a little ahead of its index without really doing better.",
  "Fund prices are published for the previous trading day. There are no prices for weekends.",
  "This is information to help you understand your funds. It is not investment advice.",
];

export default function HowItWorks() {
  const g = Math.abs(STATUS_RULES.greenMinMonthGap).toFixed(0);
  const a = Math.abs(STATUS_RULES.amberMinMonthGap).toFixed(0);
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">How it works</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Your money check-up is built to be simple to read and honest about what it knows. Here is exactly what happens behind the scenes.
        </p>
      </header>

      <section aria-labelledby="steps-h">
        <h2 id="steps-h" className="text-lg font-bold tracking-tight">From raw prices to your Saturday check-up</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="themed flex gap-4 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-extrabold text-ink" aria-hidden="true">{i + 1}</span>
              <div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="lights-h">
        <h2 id="lights-h" className="text-lg font-bold tracking-tight">What the traffic lights mean</h2>
        <div className="themed mt-3 rounded-2xl border border-line bg-card p-5 text-[15px] leading-relaxed text-ink-2 shadow-card">
          <p>We look at how far a fund is behind what it is compared with over the last month.</p>
          <ul className="mt-3 space-y-2">
            <li><strong className="text-good">On track</strong>: no more than {g} percent worse.</li>
            <li><strong className="text-warn">Worth watching</strong>: between {g} and {a} percent worse.</li>
            <li><strong className="text-bad">Needs a look</strong>: more than {a} percent worse.</li>
          </ul>
          <p className="mt-3">A fund that has trailed for {STATUS_RULES.amberWeeksLagging} weeks in a row is at least &ldquo;worth watching&rdquo;, and for {STATUS_RULES.redWeeksLagging} weeks in a row, &ldquo;needs a look&rdquo;. A green <strong className="text-good">Outperforming</strong> tag appears next to a fund that beat the average of similar funds by at least {PEER_STANDING.aheadMinMonthGap} percent over the last month.</p>
          <p className="mt-3">The overall message at the top is one of three: &ldquo;{VERDICTS.none}&rdquo; (no fund is flagged), &ldquo;{VERDICTS.watch}&rdquo; (one is), or &ldquo;{VERDICTS.review}&rdquo; (two or more are). The colours always come with an icon and a word.</p>
        </div>
      </section>

      <section aria-labelledby="limits-h">
        <h2 id="limits-h" className="text-lg font-bold tracking-tight">What we cannot tell you (the honest limits)</h2>
        <ul className="themed mt-3 list-disc space-y-2 rounded-2xl border border-line bg-card py-5 pl-9 pr-5 text-[15px] leading-relaxed text-ink-2 shadow-card">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </section>

      <section aria-labelledby="words-h">
        <h2 id="words-h" className="text-lg font-bold tracking-tight">Words you may see</h2>
        <dl className="themed mt-3 divide-y divide-line rounded-2xl border border-line bg-card shadow-card">
          {([["Price (NAV)", GLOSSARY.nav], ["Market index", GLOSSARY.index], ["Similar funds", GLOSSARY.similar], ["Year so far", GLOSSARY.ytd], ["Outperforming", GLOSSARY.outperforming], ["Market or fund?", GLOSSARY.split], ["SIP", GLOSSARY.sip]] as const).map(([w, d]) => (
            <div key={w} className="px-5 py-3 sm:flex sm:gap-6">
              <dt className="font-bold sm:w-44 sm:shrink-0">{w}</dt>
              <dd className="text-[15px] text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm text-ink-3">Want to see it in action? <Link href="/" className="font-semibold text-accent hover:underline">Open this week&apos;s check-up</Link>.</p>
    </div>
  );
}
