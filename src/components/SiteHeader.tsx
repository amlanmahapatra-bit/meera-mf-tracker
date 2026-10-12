import Link from "next/link";
import { Suspense } from "react";
import BrandMark from "./BrandMark";
import NavLinks from "./NavLinks";
import ThemeToggle from "./ThemeToggle";

export default function SiteHeader() {
  return (
    <header className="themed no-print sticky top-0 z-40 border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-ink">
          <BrandMark />
          <span className="text-[17px] leading-none">Trackerr</span>
        </Link>
        <div className="flex items-center gap-2">
          {/* NavLinks reads the current address, so it streams in behind a plain fallback (same links, no highlight). */}
          <Suspense fallback={<nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold text-ink-2"><Link href="/" className="px-3 py-1.5">This week</Link><Link href="/manage" className="px-3 py-1.5">My funds</Link><Link href="/how-it-works" className="px-3 py-1.5">How it works</Link></nav>}>
            <NavLinks />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
