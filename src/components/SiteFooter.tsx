import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="no-print border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-xs text-ink-3 sm:px-6">
        <p>This is information to help you understand your funds, not investment advice.</p>
        <p>
          Prices and index levels come from public sources. The words are written by Google Gemini and checked by code against the numbers.{" "}
          <Link href="/how-it-works" className="underline underline-offset-2 hover:text-ink">How this works</Link>
        </p>
      </div>
    </footer>
  );
}
