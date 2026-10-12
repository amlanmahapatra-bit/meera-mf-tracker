import type { Status } from "@/lib/status";

const COPY: Record<Status, { word: string; cls: string }> = {
  green: { word: "On track", cls: "bg-good-soft text-good" },
  amber: { word: "Worth watching", cls: "bg-warn-soft text-warn" },
  red: { word: "Needs a look", cls: "bg-bad-soft text-bad" },
  unknown: { word: "Not enough data", cls: "bg-card-2 text-ink-2" },
};

/** Traffic light = icon + word + colour, so it still works without colour. */
export default function StatusChip({ status }: { status: Status }) {
  const { word, cls } = COPY[status] ?? COPY.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {status === "green" && <path d="M5 12.5l4.5 4.5L19 7.5" />}
        {status === "amber" && (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></>)}
        {status === "red" && (<><path d="M12 4.5v9" /><circle cx="12" cy="18.5" r="0.6" fill="currentColor" /></>)}
        {status === "unknown" && <path d="M6 12h12" />}
      </svg>
      {word}
    </span>
  );
}
