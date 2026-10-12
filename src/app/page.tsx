import { Suspense } from "react";
import { getSupabase } from "@/lib/supabase";
import { DEBT_NOTICE, SMALLCAP_NOTICE } from "@/lib/notices";

type Fund = { scheme_code: number; name: string; slot: string; benchmark_name: string | null; peer_codes: number[] };

// Fixed display order for the standard slots; any custom slot added later goes after these.
const SLOT_ORDER = ["Large Cap", "Mid Cap", "Small Cap", "Short Duration Debt", "International"];
const slotRank = (slot: string) => (SLOT_ORDER.includes(slot) ? SLOT_ORDER.indexOf(slot) : SLOT_ORDER.length);

async function loadFunds(): Promise<{ funds: Fund[]; error: string | null }> {
  try {
    const { data, error } = await getSupabase()
      .from("funds")
      .select("scheme_code, name, slot, benchmark_name, peer_codes")
      .eq("active", true)
      .order("added_at");
    if (error) throw new Error(error.message);
    return { funds: ((data ?? []) as Fund[]).sort((a, b) => slotRank(a.slot) - slotRank(b.slot)), error: null };
  } catch (e) {
    return { funds: [], error: (e as Error).message };
  }
}

function FundsSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading your funds">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="h-28 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />
      ))}
    </ul>
  );
}

// Reads the database at request time, so it sits inside <Suspense> (page shell shows instantly).
async function FundList() {
  const { funds, error } = await loadFunds();

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
        We could not load your funds just now. Please try again in a minute.
      </div>
    );
  }
  if (funds.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-neutral-500">No funds yet. Add one to get started.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {funds.map((f) => (
        <li key={f.scheme_code} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{f.slot}</p>
          <p className="mt-1 font-medium leading-snug">{f.name}</p>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Compared with: {f.benchmark_name ?? "similar funds only"}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {f.peer_codes.length > 0 ? `${f.peer_codes.length} similar funds for comparison` : "No similar funds set yet"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Meera&apos;s Money Check</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your Saturday-morning fund check-up</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          A calm, plain-language summary of how your SIP funds did this week. The first full report is coming soon.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">Good to know</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>{SMALLCAP_NOTICE}</li>
          <li>{DEBT_NOTICE}</li>
        </ul>
      </section>

      <h2 className="mb-3 text-lg font-semibold">Funds being tracked</h2>
      <Suspense fallback={<FundsSkeleton />}>
        <FundList />
      </Suspense>
    </main>
  );
}
