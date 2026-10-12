import { recentRuns } from "@/lib/db";

/** Public, read-only: when each job last ran and how it went (the reliability log). No secrets. */
export async function GET() {
  try {
    const runs = await recentRuns(10);
    return Response.json({
      ok: true,
      runs: runs.map((r) => ({ job: r.job, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at, error: r.error ? String(r.error).slice(0, 200) : null })),
    });
  } catch {
    return Response.json({ ok: false, error: "The run log could not be read just now." }, { status: 503 });
  }
}
