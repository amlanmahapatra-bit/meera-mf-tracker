"use client";

import Link from "next/link";
import { slotRank } from "@/lib/funds";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type Fund = { scheme_code: number; name: string; slot: string; benchmark_name: string | null; peers: number };
type Hit = { schemeCode: number; schemeName: string };
type Preview = { schemeCode: number; name: string; fundHouse: string | null; latestNavDate: string; suggestion: { slot: string; benchmarkName: string | null; reason: string } };
type EmailInfo = { configured: boolean; problem?: string; recipients: string[]; from?: string; tableReady: boolean; lastSent: string | null };
type Run = { job: string; status: string; startedAt: string; finishedAt: string | null; error: string | null };
type Props = { benchmarks: string[]; slots: string[] };

const sortFunds = (f: Fund[]) => [...f].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
const card = "themed rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6";
const input = "w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3";
const btn = "inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink hover:opacity-90 disabled:opacity-50";
const btn2 = "inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-semibold text-ink hover:bg-card-2 disabled:opacity-50";

const JOB_WORDS: Record<string, string> = { daily_nav: "Daily price update", weekly_report: "Saturday check-up", manual_run: "Update now", backfill: "Past history filled in" };
const STATUS_WORDS: Record<string, string> = { success: "Worked", partial: "Worked (used a backup)", failed: "Failed", running: "Running" };

async function api<T>(url: string, passcode: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), "x-admin-passcode": passcode, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const data = (await res.json().catch(() => ({ error: "The server sent something we could not read." }))) as T & { error?: string };
  return { ok: res.ok, status: res.status, data };
}

// The passcode is remembered only for this browser tab (sessionStorage) and read the React-approved way.
const subscribePasscode = (cb: () => void) => {
  window.addEventListener("passcode-change", cb);
  return () => window.removeEventListener("passcode-change", cb);
};
const readPasscode = () => {
  try { return sessionStorage.getItem("admin-passcode") ?? ""; } catch { return ""; }
};

export default function ManagePanel({ benchmarks, slots }: Props) {
  const [memoryPasscode, setMemoryPasscode] = useState(""); // fallback if the browser blocks storage
  const storedPasscode = useSyncExternalStore(subscribePasscode, readPasscode, () => "");
  const passcode = storedPasscode || memoryPasscode;
  const [typed, setTyped] = useState("");
  const [unlockErr, setUnlockErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [fundsErr, setFundsErr] = useState("");
  const [runs, setRuns] = useState<Run[] | null>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [slot, setSlot] = useState("");
  const [bench, setBench] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [email, setEmail] = useState<EmailInfo | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const loadFunds = useCallback(async () => {
    try {
      const r = await fetch("/api/funds");
      const j = await r.json();
      if (!r.ok) throw new Error();
      setFunds(sortFunds(j.funds));
      setFundsErr("");
    } catch {
      setFundsErr("We could not load your funds just now.");
    }
  }, []);
  const loadRuns = useCallback(async () => {
    try {
      const j = await (await fetch("/api/health")).json();
      setRuns(j.ok ? j.runs : []);
    } catch {
      setRuns([]);
    }
  }, []);

  // First load. State is only set after the network answers (inside .then), never synchronously in the effect.
  useEffect(() => {
    let alive = true;
    fetch("/api/funds").then((r) => r.json()).then((j) => { if (alive && j.ok) setFunds(sortFunds(j.funds)); else if (alive) setFundsErr("We could not load your funds just now."); }).catch(() => { if (alive) setFundsErr("We could not load your funds just now."); });
    fetch("/api/health").then((r) => r.json()).then((j) => { if (alive) setRuns(j.ok ? j.runs : []); }).catch(() => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setUnlockErr("");
    const r = await api<object>("/api/admin/check", typed, { method: "POST" });
    setChecking(false);
    if (!r.ok) return setUnlockErr(r.data.error ?? "That passcode is not right.");
    setMemoryPasscode(typed);
    try { sessionStorage.setItem("admin-passcode", typed); } catch {}
    window.dispatchEvent(new Event("passcode-change"));
    setTyped("");
  }
  function lock() {
    setMemoryPasscode("");
    try { sessionStorage.removeItem("admin-passcode"); } catch {}
    window.dispatchEvent(new Event("passcode-change"));
  }

  // Once unlocked, ask whether the Saturday email is ready (state is set only after the network answers).
  useEffect(() => {
    if (!passcode) return;
    let alive = true;
    fetch("/api/admin/email-status", { headers: { "x-admin-passcode": passcode } })
      .then((r) => r.json())
      .then((j) => { if (alive && j.ok) setEmail(j); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [passcode]);

  async function sendTest() {
    setEmailMsg(null); setBusy("email");
    const r = await api<{ reason?: string; status?: string }>("/api/admin/send-test-email", passcode, { method: "POST" });
    setBusy("");
    if (r.data.status === "sent") setEmailMsg({ tone: "ok", text: `${r.data.reason ?? "Test email sent."} It can take a minute to arrive; check spam too.` });
    else setEmailMsg({ tone: "bad", text: r.data.reason ?? r.data.error ?? "The test email could not be sent." });
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setPreview(null); setHits(null); setBusy("search");
    const r = await api<{ results: Hit[] }>(`/api/funds/search?q=${encodeURIComponent(query)}`, passcode);
    setBusy("");
    if (!r.ok) return setMsg({ tone: "bad", text: r.data.error ?? "Search failed." });
    setHits(r.data.results);
  }

  async function lookup(c: string) {
    setMsg(null); setPreview(null); setBusy("lookup");
    const r = await api<{ fund: Preview }>(`/api/funds/preview?code=${encodeURIComponent(c)}`, passcode);
    setBusy("");
    if (!r.ok) return setMsg({ tone: "bad", text: r.data.error ?? "We could not look that up." });
    setPreview(r.data.fund);
    setSlot(r.data.fund.suggestion.slot);
    setBench(r.data.fund.suggestion.benchmarkName ?? "");
  }

  async function add() {
    if (!preview) return;
    setMsg(null); setBusy("add");
    const r = await api<{ added: { name: string; note: string; peers: number } }>("/api/funds", passcode, {
      method: "POST",
      body: JSON.stringify({ schemeCode: preview.schemeCode, slot, benchmarkName: bench || null }),
    });
    setBusy("");
    if (!r.ok) return setMsg({ tone: "bad", text: r.data.error ?? "We could not add that fund." });
    setMsg({ tone: "ok", text: `Added ${r.data.added.name}. ${r.data.added.note} It will appear in your next check-up; press "Update now" below to see it straight away.` });
    setPreview(null); setHits(null); setQuery(""); setCode("");
    loadFunds();
  }

  async function remove(schemeCode: number) {
    setMsg(null); setBusy(`rm${schemeCode}`);
    const r = await api<{ removed: { name: string } }>("/api/funds", passcode, { method: "DELETE", body: JSON.stringify({ schemeCode }) });
    setBusy(""); setConfirming(null);
    if (!r.ok) return setMsg({ tone: "bad", text: r.data.error ?? "We could not remove that fund." });
    setMsg({ tone: "ok", text: `Removed ${r.data.removed.name}. Its history is kept, so you can add it back any time.` });
    loadFunds();
  }

  async function fillHistory() {
    setRunResult(null); setBusy("history");
    try {
      const r = await api<{ status: string; skipped?: string; details?: { rowsWritten?: number; years?: number } }>("/api/admin/backfill?years=5", passcode, { method: "POST" });
      if (!r.ok) setRunResult({ tone: "bad", text: r.data.error ?? "The history could not be filled in. Nothing was lost." });
      else if (r.data.skipped) setRunResult({ tone: "bad", text: r.data.skipped });
      else setRunResult({ tone: "ok", text: `Done. ${r.data.details?.rowsWritten ?? ""} weeks of history saved for your funds (up to ${r.data.details?.years ?? 5} years). It is safe to do this again any time.` });
    } catch {
      setRunResult({ tone: "bad", text: "We lost the connection before it finished. Check the log below in a minute." });
    }
    setBusy("");
    loadRuns();
  }

  async function runNow() {
    setRunResult(null); setBusy("run");
    try {
      const r = await api<{ status: string; skipped?: string; details?: { weekly?: { verdict?: string; fundsReported?: number; writer?: string } } }>("/api/admin/run", passcode, { method: "POST" });
      if (!r.ok) setRunResult({ tone: "bad", text: r.data.error ?? "The update did not finish. Your last check-up is still safe." });
      else if (r.data.skipped) setRunResult({ tone: "bad", text: r.data.skipped });
      else {
        const w = r.data.details?.weekly;
        setRunResult({ tone: "ok", text: `Done. ${w?.fundsReported ?? ""} funds checked. Verdict: ${w?.verdict ?? "see the page"}.${r.data.status === "partial" ? " A backup source was used for part of it." : ""}` });
      }
    } catch {
      setRunResult({ tone: "bad", text: "We lost the connection before it finished. It may still be working; check the log below in a minute." });
    }
    setBusy("");
    loadRuns();
  }

  const unlocked = passcode !== "";
  const noteClass = (t: "ok" | "bad") => `rounded-xl px-4 py-3 text-sm ${t === "ok" ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">My funds</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">Add a fund, remove one, or refresh your check-up. You never need to touch any code.</p>
      </header>

      <section aria-labelledby="funds-h" className={card}>
        <h2 id="funds-h" className="text-lg font-bold tracking-tight">Funds being tracked</h2>
        {fundsErr && <p role="alert" className="mt-3 text-sm text-bad">{fundsErr}</p>}
        {funds === null && !fundsErr && <div className="mt-3 h-20 animate-pulse rounded-xl bg-card-2" aria-busy="true" />}
        {funds && funds.length === 0 && <p className="mt-3 text-sm text-ink-2">No funds yet. Add your first one below.</p>}
        {funds && funds.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {funds.map((f) => (
              <li key={f.scheme_code} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">{f.slot}</p>
                  <Link href={`/funds/${f.scheme_code}`} className="font-semibold hover:underline">{f.name}</Link>
                  <p className="text-xs text-ink-3">Code {f.scheme_code} &middot; {f.benchmark_name ? `compared with the ${f.benchmark_name}` : "compared with similar funds"} &middot; {f.peers} similar funds</p>
                </div>
                {unlocked && (confirming === f.scheme_code ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-ink-2">Remove this fund?</span>
                    <button type="button" className={btn} disabled={busy === `rm${f.scheme_code}`} onClick={() => remove(f.scheme_code)}>Yes, remove</button>
                    <button type="button" className={btn2} onClick={() => setConfirming(null)}>Keep it</button>
                  </div>
                ) : (
                  <button type="button" className={btn2} onClick={() => setConfirming(f.scheme_code)}>Remove</button>
                ))}
              </li>
            ))}
          </ul>
        )}
        {msg && <p role="status" className={`mt-4 ${noteClass(msg.tone)}`}>{msg.text}</p>}
      </section>

      {!unlocked ? (
        <section aria-labelledby="unlock-h" className={card}>
          <h2 id="unlock-h" className="text-lg font-bold tracking-tight">Unlock to make changes</h2>
          <p className="mt-1 text-sm text-ink-2">Enter your admin passcode. It is only remembered until you close this tab.</p>
          <form onSubmit={unlock} className="mt-4 flex max-w-md flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="passcode">Admin passcode</label>
            <input id="passcode" type="password" autoComplete="current-password" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Admin passcode" className={input} />
            <button type="submit" className={btn} disabled={!typed || checking}>{checking ? "Checking..." : "Unlock"}</button>
          </form>
          {unlockErr && <p role="alert" className="mt-3 text-sm font-semibold text-bad">{unlockErr}</p>}
        </section>
      ) : (
        <>
          <section aria-labelledby="add-h" className={card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="add-h" className="text-lg font-bold tracking-tight">Add a fund</h2>
                <p className="mt-1 text-sm text-ink-2">Only Direct plans with the Growth option are shown (the ones without IDCW or dividend payouts).</p>
              </div>
              <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={lock}>Lock</button>
            </div>

            <form onSubmit={search} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="q">Search by fund name</label>
              <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, for example: nifty 50 index" className={input} />
              <button type="submit" className={btn} disabled={query.trim().length < 3 || busy === "search"}>{busy === "search" ? "Searching..." : "Search"}</button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="mt-3 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="code">Scheme code</label>
              <input id="code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Or paste a scheme code, for example 118482" className={input} />
              <button type="submit" className={btn2} disabled={!code || busy === "lookup"}>{busy === "lookup" ? "Looking up..." : "Look up"}</button>
            </form>

            {hits && (
              <div className="mt-4">
                {hits.length === 0 ? <p className="text-sm text-ink-2">No Direct Growth funds matched. Try fewer or different words.</p> : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {hits.map((h) => (
                      <li key={h.schemeCode} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0"><p className="text-sm font-semibold">{h.schemeName}</p><p className="text-xs text-ink-3">Code {h.schemeCode}</p></div>
                        <button type="button" className={btn2} onClick={() => lookup(String(h.schemeCode))}>Choose</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {preview && (
              <div className="mt-5 rounded-xl border border-line-strong bg-card-2 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-3">Check and add</p>
                <p className="mt-1 font-bold">{preview.name}</p>
                <p className="text-xs text-ink-3">Code {preview.schemeCode} &middot; latest price {preview.latestNavDate}</p>
                <p className="mt-3 text-sm text-ink-2">{preview.suggestion.reason} You can change these.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">What kind of fund is it?
                    <input list="slots" value={slot} onChange={(e) => setSlot(e.target.value)} className={`${input} mt-1 font-normal`} />
                    <datalist id="slots">{slots.map((s) => <option key={s} value={s} />)}</datalist>
                  </label>
                  <label className="text-sm font-semibold">Market index to compare with
                    <select value={bench} onChange={(e) => setBench(e.target.value)} className={`${input} mt-1 font-normal`}>
                      <option value="">None (compare with similar funds only)</option>
                      {benchmarks.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" className={btn} disabled={busy === "add" || slot.trim().length < 2} onClick={add}>{busy === "add" ? "Adding and saving its history..." : "Add this fund"}</button>
                  <button type="button" className={btn2} onClick={() => setPreview(null)}>Cancel</button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="run-h" className={card}>
            <h2 id="run-h" className="text-lg font-bold tracking-tight">Update now</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">&ldquo;Update now&rdquo; saves the latest prices, reads this week&apos;s news and writes a fresh check-up (about a minute). It also happens by itself every day and every Saturday morning. &ldquo;Fill in past history&rdquo; adds the past five years of weekly results to the trend chart, for example after you add a new fund.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={btn} onClick={runNow} disabled={busy === "run"}>{busy === "run" ? "Working, please wait about a minute..." : "Update now"}</button>
              <button type="button" className={btn2} onClick={fillHistory} disabled={busy === "history" || busy === "run"}>{busy === "history" ? "Filling in history..." : "Fill in past history"}</button>
              {runResult && <Link href="/" className="text-sm font-semibold text-accent hover:underline">See the check-up</Link>}
            </div>
            {busy === "run" && <p role="status" className="mt-3 text-sm text-ink-2">Please keep this page open.</p>}
            {runResult && <p role="status" className={`mt-4 ${noteClass(runResult.tone)}`}>{runResult.text}</p>}
          </section>

          <section aria-labelledby="email-h" className={card}>
            <h2 id="email-h" className="text-lg font-bold tracking-tight">Saturday email</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">Your check-up is emailed automatically every Saturday morning (India time), right after it is made. It is never sent when you press &ldquo;Update now&rdquo;.</p>
            {email === null ? <div className="mt-3 h-10 animate-pulse rounded-xl bg-card-2" aria-busy="true" /> : email.configured ? (
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold">Goes to</dt><dd className="text-ink-2">{email.recipients.join(", ")}</dd></div>
                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold">Sent from</dt><dd className="text-ink-2">{email.from}</dd></div>
                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold">Last sent</dt><dd className="text-ink-2">{email.lastSent ? `week ending ${email.lastSent}` : "not yet"}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{email.problem ?? "Email is not set up yet."} Add the email settings where the site is hosted and it will switch on by itself.</p>
            )}
            {email && !email.tableReady && <p className="mt-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">One setup step is missing: run <code>sql/002_email_log.sql</code> in Supabase. Until then no weekly email is sent (this protects against sending the same week twice).</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={btn2} onClick={sendTest} disabled={busy === "email" || !email?.configured}>{busy === "email" ? "Sending..." : "Send me a test email now"}</button>
            </div>
            {emailMsg && <p role="status" className={`mt-4 ${noteClass(emailMsg.tone)}`}>{emailMsg.text}</p>}
          </section>
        </>
      )}

      <section aria-labelledby="log-h" className={card}>
        <h2 id="log-h" className="text-lg font-bold tracking-tight">Recent updates</h2>
        <p className="mt-1 text-sm text-ink-2">Every automatic and manual update is recorded here.</p>
        {runs === null ? <div className="mt-3 h-16 animate-pulse rounded-xl bg-card-2" aria-busy="true" /> : runs.length === 0 ? <p className="mt-3 text-sm text-ink-3">No updates recorded yet.</p> : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {runs.slice(0, 6).map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-semibold">{JOB_WORDS[r.job] ?? r.job}</span>
                <span className="text-ink-3">{new Date(r.startedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "failed" ? "bg-bad-soft text-bad" : r.status === "partial" ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}>{STATUS_WORDS[r.status] ?? r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
