import type { Verdict } from "./config";
import type { FundComparison } from "./comparison";
import type { Status } from "./status";
import type { Headline } from "./sources/news";

/** One fund's slice of the weekly report. All numbers come from code; sentences come from Gemini or the template. */
export type FundReport = {
  schemeCode: number;
  name: string;
  slot: string;
  status: Status;
  weeksLagging: number;
  nav: number;
  /** Date of the NAV used ("data as of"). */
  asOf: string;
  comparison: FundComparison;
  /** Plain words for what this fund is judged against, e.g. "the Nifty 50" or "similar funds". */
  referenceLabel: string;
  /** Exactly three plain-language sentences: performance, comparison, market events. */
  sentences: [string, string, string];
  /** Where each data set came from, so the screen can say "using saved data from 8 Oct". */
  dataNotes: string[];
};

export type IndexMove = { name: string; week: number | null; month: number | null; ytd: number | null; asOf: string | null };

export type MarketContext = {
  indexMoves: IndexMove[];
  news: { source: "gnews" | "google_news_rss" | "none"; note: string; headlines: Headline[] };
  /** Honest limits shown on screen, e.g. the Smallcap 100 note. */
  notices: string[];
};

export type ReportLanguage = "en" | "hinglish";

export type ReportJson = {
  weekEnding: string;
  generatedAt: string;
  language: ReportLanguage;
  verdict: Verdict;
  verdictReason: string;
  funds: FundReport[];
  marketContext: MarketContext;
  /** Whether Gemini wrote the words, or the built-in template did (and why). */
  writer: { kind: "gemini" | "template"; model: string | null; reason: string | null };
};

/** Everything the writer needs (the same numbers whether Gemini or the template writes the words). */
export type ReportInput = Omit<ReportJson, "writer" | "funds" | "generatedAt"> & {
  funds: Omit<FundReport, "sentences">[];
  /** Last few weeks of status per scheme code, newest first, for context. */
  recentStatuses: Record<number, { weekEnding: string; status: string }[]>;
};
