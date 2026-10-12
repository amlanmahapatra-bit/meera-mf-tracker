import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import AskLauncher from "@/components/AskLauncher";
import SiteFooter from "@/components/SiteFooter";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Trackerr", template: "%s | Trackerr" },
  description: "A calm, plain-language weekly check-up on your mutual funds.",
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f1f7fc" }, { media: "(prefers-color-scheme: dark)", color: "#0b1521" }],
};

// Runs before the page paints, so the saved (or device) theme is applied without a flash of the wrong colours.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">{children}</main>
        <SiteFooter />
        <AskLauncher />
      </body>
    </html>
  );
}
