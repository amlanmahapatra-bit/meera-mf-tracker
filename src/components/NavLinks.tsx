"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "This week", match: (p: string) => p === "/" || p.startsWith("/funds") },
  { href: "/report", label: "Weekly report", match: (p: string) => p.startsWith("/report") },
  { href: "/manage", label: "Add / remove funds", match: (p: string) => p.startsWith("/manage") },
  { href: "/how-it-works", label: "How it works", match: (p: string) => p.startsWith("/how-it-works") },
];

export default function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
            className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold sm:px-3 ${active ? "bg-accent-soft text-ink" : "text-ink-2 hover:text-ink"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
