import { finishRun, isRunInProgress, startRun, type Json, type RunJob } from "../db";

export type JobOutcome = {
  /** "partial" means it worked but used a fallback (cached data, backup news, template text, skipped peers...). */
  status: "success" | "partial";
  details: Json;
};

export type JobResult = { runId: string | null; skipped?: string; status: "success" | "partial" | "failed"; error?: string; details: Json };

/**
 * Runs a job with a pipeline_runs log row around it: start, end, status, error.
 * Never throws; a failure is recorded and returned so cron routes can answer cleanly.
 */
export async function withRun(job: RunJob, fn: () => Promise<JobOutcome>): Promise<JobResult> {
  if (await isRunInProgress(job)) {
    return { runId: null, skipped: `A ${job} run is already in progress (started in the last 10 minutes).`, status: "partial", details: {} };
  }
  let runId: string | null = null;
  try {
    runId = await startRun(job);
  } catch (e) {
    // The log is for visibility; if only the log is broken the job should still run.
    console.error("pipeline_runs unavailable:", (e as Error).message);
  }
  try {
    const out = await fn();
    if (runId) await finishRun(runId, out.status, null, out.details);
    return { runId, status: out.status, details: out.details };
  } catch (e) {
    const message = (e as Error).message;
    if (runId) await finishRun(runId, "failed", message, {});
    return { runId, status: "failed", error: message, details: {} };
  }
}
