import Link from "next/link";

export default function NotFound() {
  return (
    <section className="themed rounded-2xl border border-line bg-card p-6 shadow-card">
      <h1 className="text-xl font-extrabold tracking-tight">We could not find that page</h1>
      <p className="mt-2 text-[15px] text-ink-2">The link may be old, or the fund may have been removed.</p>
      <Link href="/" className="mt-4 inline-block rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink hover:opacity-90">Back to this week</Link>
    </section>
  );
}
