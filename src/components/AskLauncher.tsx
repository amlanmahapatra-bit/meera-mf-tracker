"use client";

import { useEffect, useRef, useState } from "react";
import AskBox from "./AskBox";

/** A button that stays at the bottom corner of every page and opens the "Ask about your money" chat. */
export default function AskLauncher() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="no-print">
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Ask about your money" className="themed fixed inset-x-3 bottom-20 z-40 max-h-[78vh] overflow-y-auto rounded-2xl border border-line-strong bg-card p-4 shadow-card sm:inset-x-auto sm:right-5 sm:w-[420px] sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Ask about your money</h2>
              <p className="text-sm text-ink-2">Type a question in your own words. Answers use only your saved numbers and this week&apos;s news.</p>
            </div>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg border border-line px-2.5 py-1 text-sm font-semibold text-ink-2 hover:bg-card-2">&times;</button>
          </div>
          <AskBox bare />
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="fixed bottom-5 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-bold text-accent-ink shadow-card hover:opacity-90 sm:right-5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
        {open ? "Close" : "Ask about my money"}
      </button>
    </div>
  );
}
