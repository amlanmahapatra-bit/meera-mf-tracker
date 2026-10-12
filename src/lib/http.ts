import { HTTP } from "./config";

export type FetchOptions = RequestInit & { timeoutMs?: number; retries?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with a timeout and automatic retries (network errors, 429 and 5xx are retried
 * with a growing pause). Returns the final Response even if it is an error status, so the
 * caller can decide; throws only when the network itself keeps failing.
 */
export async function fetchRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = HTTP.timeoutMs, retries = HTTP.retries, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "Mozilla/5.0 (meera-mf-tracker)", ...(init.headers ?? {}) },
      });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === retries) return res;
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
    }
    await sleep(HTTP.backoffMs * 2 ** attempt);
  }
  const cause = (lastErr as { cause?: { code?: string } } | undefined)?.cause?.code;
  throw new Error(`Request failed after ${retries + 1} tries: ${(lastErr as Error)?.message ?? "unknown"}${cause ? ` (${cause})` : ""}`);
}

/** GET JSON, throwing a clear error for non-2xx or invalid JSON. */
export async function getJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchRetry(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`Invalid JSON from ${new URL(url).host}`);
  }
}
