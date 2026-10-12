"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="themed rounded-2xl border border-line bg-card p-6 shadow-card">
      <h1 className="text-xl font-extrabold tracking-tight">Something went wrong on this page</h1>
      <p className="mt-2 text-[15px] text-ink-2">Nothing of yours was lost. You can try again, or go back to this week&apos;s check-up.</p>
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={reset} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink hover:opacity-90">Try again</button>
        <Link href="/" className="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold hover:bg-card-2">Back to this week</Link>
      </div>
    </section>
  );
}
