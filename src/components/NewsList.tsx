import type { MarketContext } from "@/lib/report-types";

const SOURCE_LABEL = { gnews: "GNews", google_news_rss: "Google News (backup source)", none: "No news source" } as const;

export default function NewsList({ news }: { news: MarketContext["news"] }) {
  return (
    <section aria-labelledby="news-title">
      <h2 id="news-title" className="text-lg font-bold tracking-tight">In the news this week</h2>
      <p className="mt-1 text-sm text-ink-2">Headlines can hint at why markets moved, but they do not prove it. Source: {SOURCE_LABEL[news.source]}.</p>
      {news.headlines.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line p-5 text-sm text-ink-3">{news.note || "No headlines could be loaded this week."}</p>
      ) : (
        <ul className="themed mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {news.headlines.slice(0, 6).map((h) => (
            <li key={h.url || h.title}>
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-card-2">
                <span className="block text-[15px] font-semibold leading-snug text-ink">{h.title}</span>
                <span className="mt-0.5 block text-xs text-ink-3">{h.source}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
