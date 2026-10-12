import type { MarketContext } from "@/lib/report-types";

const SOURCE_LABEL = { gnews: "GNews", google_news_rss: "Google News (backup source)", none: "no news source" } as const;

/**
 * "Why the markets moved this week": a plain summary plus the real news behind it. Every reason is tied to a
 * headline that was actually fetched, and links to the article so Meera can read it herself.
 */
export default function MarketStory({ market }: { market: MarketContext }) {
  const overview = market.overview ?? [];
  const drivers = market.drivers ?? [];
  if (overview.length === 0 && drivers.length === 0) return null;
  return (
    <section aria-labelledby="why-title">
      <h2 id="why-title" className="text-lg font-bold tracking-tight">Why the markets moved this week</h2>
      <p className="mt-1 text-sm text-ink-2">
        We read this week&apos;s live news ({SOURCE_LABEL[market.news.source]}) and matched it with how the markets moved. News can fit a move without proving it.
      </p>
      <div className="themed mt-3 rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6">
        {overview.length > 0 && <p className="text-[16px] leading-relaxed text-ink-2">{overview.join(" ")}</p>}
        {drivers.length > 0 && (
          <ul className={`space-y-4 ${overview.length > 0 ? "mt-5 border-t border-line pt-5" : ""}`}>
            {drivers.map((d) => (
              <li key={d.headline}>
                <p className="text-[15px] leading-relaxed text-ink-2">{d.text}</p>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm font-semibold leading-snug text-accent hover:underline">
                  {d.headline} <span className="font-normal text-ink-3">&middot; {d.source} &#8599;</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
