/**
 * The per-IP rate limits (ADR 0010 §5): 20 questions and 120 API calls per minute, so the
 * public app cannot run up the LLM and GPU. Kept in memory, which is reliable because one server
 * instance serves the app. The clock is passed in.
 */

export const RATE_LIMIT_MESSAGE = "Too many questions in a minute, try again shortly.";

const WINDOW_MS = 60_000;
const ASK_LIMIT = 20;
const API_LIMIT = 120;
/** Past this many IPs, forget the ones with no request left in the window. */
const SWEEP_AT_KEYS = 10_000;

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface ApiRateLimiter {
  /** Counts a request to `pathname` from the IP `key` at `now` (ms), or refuses it without counting it. */
  take(pathname: string, key: string, now: number): RateDecision;
}

/**
 * The IP a request counts against: the CF-Connecting-IP header, trusted only because the app
 * listens on loopback and cloudflared sets it. Requests without it are local processes and share
 * the key "local".
 */
export function ipKey(headers: Headers): string {
  const ip = headers.get("cf-connecting-ip")?.trim();
  return ip === undefined || ip === "" ? "local" : ip;
}

/** At most `limit` requests per key in any `windowMs`, kept as each key's request times, oldest first. */
function slidingWindow(limit: number, windowMs: number) {
  const times = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const kept = (times.get(key) ?? []).filter((time) => now - time < windowMs);
    if (kept.length === 0) times.delete(key);
    else times.set(key, kept);
    return kept;
  }

  return {
    /** Milliseconds until one more request fits: 0 when it fits now. */
    waitMs(key: string, now: number): number {
      const kept = recent(key, now);
      if (kept.length < limit) return 0;
      return (kept[kept.length - limit] ?? now) + windowMs - now;
    },
    record(key: string, now: number): void {
      if (times.size >= SWEEP_AT_KEYS) for (const known of times.keys()) recent(known, now);
      times.set(key, [...(times.get(key) ?? []), now]);
    },
  };
}

export function createApiRateLimiter(): ApiRateLimiter {
  const ask = slidingWindow(ASK_LIMIT, WINDOW_MS);
  const api = slidingWindow(API_LIMIT, WINDOW_MS);
  return {
    take(pathname, key, now) {
      if (!pathname.startsWith("/api/")) return { allowed: true };
      // A question counts against both limits.
      const windows = pathname === "/api/ask" ? [ask, api] : [api];
      const wait = Math.max(...windows.map((window) => window.waitMs(key, now)));
      if (wait > 0) return { allowed: false, retryAfterSeconds: Math.ceil(wait / 1000) };
      for (const window of windows) window.record(key, now);
      return { allowed: true };
    },
  };
}

declare global {
  // On globalThis rather than in module state, so the counts survive this module being evaluated again
  // (a development reload, or a second bundle of the proxy); there is still one limiter per process.
  var spaceshipApiRateLimiter: ApiRateLimiter | undefined;
}

/** The server process's one limiter. */
export function apiRateLimiter(): ApiRateLimiter {
  globalThis.spaceshipApiRateLimiter ??= createApiRateLimiter();
  return globalThis.spaceshipApiRateLimiter;
}
