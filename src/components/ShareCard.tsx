import Link from "next/link";
import type { ReportJson } from "@/lib/report-types";
import { buildShareText, whatsappLink } from "@/lib/share";
import CopyButton from "./ShareActions";

/** An optional extra, kept small and out of the way: share the funds' prices with a CA if (and only if) Meera wants to. */
export default function ShareCard({ report }: { report: ReportJson }) {
  const text = buildShareText(report);
  const small = "rounded-lg border border-line-strong bg-card px-3 py-1.5 text-sm font-semibold text-ink hover:bg-card-2";
  return (
    <section aria-labelledby="share-title" className="themed no-print flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-dashed border-line-strong px-5 py-4">
      <div>
        <h2 id="share-title" className="text-sm font-bold">Optional: share your funds with your CA</h2>
        <p className="mt-0.5 text-sm text-ink-3">Writes a ready message with each fund&apos;s name, scheme code and price. You choose who gets it.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer" className={small}>WhatsApp</a>
        <CopyButton text={text} label="Copy" className={small} />
        <Link href="/share" className="px-2 py-1.5 text-sm font-semibold text-accent hover:underline">More ways</Link>
      </div>
    </section>
  );
}
