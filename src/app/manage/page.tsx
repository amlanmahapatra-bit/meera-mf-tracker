import type { Metadata } from "next";
import ManagePanel from "@/components/ManagePanel";
import { BENCHMARKS } from "@/lib/config";
import { SLOT_SUGGESTIONS } from "@/lib/funds";

export const metadata: Metadata = { title: "My funds" };

export default function ManagePage() {
  return <ManagePanel benchmarks={Object.keys(BENCHMARKS)} slots={[...SLOT_SUGGESTIONS]} />;
}
