"use client";

import { useState } from "react";

const EXAMPLES = ["How are my funds doing this week?", "Why did my US fund go up?", "Which fund needs the most attention?", "Why did the markets move this week?"];

type Answer = { kind: "answer" | "problem"; text: string; weekEnding?: string };

/** "Ask about my money": plain questions, answered only from her saved report and this week's headlines. */
export default function AskBox({ bare = false }: { bare?: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; answer?: string; error?: string; weekEnding?: string } | null;
      if (j?.ok && j.answer) setResult({ kind: "answer", text: j.answer, weekEnding: j.weekEnding });
      else setResult({ kind: "problem", text: j?.error ?? "Something went wrong. Please try again in a moment." });
    } catch {
      setResult({ kind: "problem", text: "We could not reach the helper. Please check your internet and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={bare ? undefined : "ask-title"} aria-label={bare ? "Ask about your money" : undefined}>
      {!bare && (
        <>
          <h2 id="ask-title" className="text-lg font-bold tracking-tight">Ask about your money</h2>
          <p className="mt-1 text-sm text-ink-2">Type a question in your own words. The answer uses only your saved numbers and this week&apos;s news.</p>
        </>
      )}
      <div className={bare ? "" : "themed mt-3 rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5"}>
        <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={bare ? "ask-input-float" : "ask-input"} className="sr-only">Your question</label>
          <input id={bare ? "ask-input-float" : "ask-input"} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="For example: why did my small cap fund dip?"
            className="min-w-0 flex-1 rounded-xl border border-line-strong bg-page px-4 py-3 text-[15px] text-ink placeholder:text-ink-3" />
          <button type="submit" disabled={busy || question.trim().length < 3} className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-ink hover:opacity-90 disabled:opacity-50">
            {busy ? "Thinking…" : "Ask"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" disabled={busy} onClick={() => { setQuestion(e); void ask(e); }} className="rounded-full border border-line bg-card-2 px-3 py-1 text-xs font-semibold text-ink-2 hover:text-ink disabled:opacity-50">{e}</button>
          ))}
        </div>
        <div aria-live="polite" className="mt-4">
          {busy && <p className="animate-pulse text-sm text-ink-3">Reading your numbers and the news…</p>}
          {result && (
            <div className={`rounded-xl px-4 py-3 text-[15px] leading-relaxed ${result.kind === "answer" ? "border-l-4 border-accent bg-accent-soft text-ink" : "bg-warn-soft text-warn"}`}>
              <p>{result.text}</p>
              {result.kind === "answer" && <p className="mt-2 text-xs text-ink-3">Based on the report for the week ending {result.weekEnding}. This is information, not investment advice.</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
