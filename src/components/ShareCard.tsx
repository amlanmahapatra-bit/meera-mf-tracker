import Link from "next/link";
import type { ReportJson } from "@/lib/report-types";
import { buildShareText, whatsappLink } from "@/lib/share";
import CopyButton from "./ShareActions";

/** The "no friction" box: one tap puts every fund's name, scheme code, price and returns into a message for the CA. */
export default function ShareCard({ report }: { report: ReportJson }) {
  const text = buildShareText(report);
  return (
    <section aria-labelledby="share-title" className="themed no-print rounded-2xl border border-line bg-card p-5 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
      <div>
        <h2 id="share-title" className="text-lg font-bold tracking-tight">Need to send your funds to your CA?</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-2">
          One tap writes the message for you: every fund&apos;s name, scheme code, price (NAV) and returns. You only pick your CA&apos;s chat.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0 sm:justify-end">
        <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink hover:opacity-90">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.7-5.2A8.5 8.5 0 1 1 21 12Z" /></svg>
          Send on WhatsApp
        </a>
        <CopyButton text={text} className="rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-semibold text-ink hover:bg-card-2" />
        <Link href="/share" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-accent hover:underline">More ways</Link>
      </div>
    </section>
  );
}
