"use client";

import { useState } from "react";

/** Copy-to-clipboard button with a clear "Copied" confirmation (and a manual fallback if the browser blocks it). */
export default function CopyButton({ text, label = "Copy message", className = "" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button type="button" onClick={copy} className={className}>
      {state === "copied" ? "Copied" : state === "failed" ? "Could not copy, select the text instead" : label}
      <span className="sr-only" role="status">{state === "copied" ? "Message copied to the clipboard" : ""}</span>
    </button>
  );
}
