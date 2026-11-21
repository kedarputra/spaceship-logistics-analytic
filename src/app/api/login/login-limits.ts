import { slidingWindow } from "../rate-limit";

/**
 * The sign-in limits (ticket 31): 5 tries a minute per IP, and 10 wrong passwords an hour per
 * username, then 429 with the wait in seconds. A try is counted before its password is checked, so
 * tries sent at once cannot slip past the limit; a right password is then taken back from the
 * username's count, so reviewers sharing one test account never lock each other out. In memory,
 * like the other limits (ADR 0010 §5).
 */

export const TRIES_PER_IP_PER_MINUTE = 5;
export const WRONG_TRIES_PER_USERNAME_PER_HOUR = 10;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export type SignInDecision = { allowed: true; succeeded: () => void } | { allowed: false; retryAfterSeconds: number };

export interface LoginLimiter {
  /** Counts a try from `ip` for `username` (already normalized) at `now`, or refuses it without counting. */
  take(ip: string, username: string, now: number): SignInDecision;
}

export function createLoginLimiter(): LoginLimiter {
  const byIp = slidingWindow(TRIES_PER_IP_PER_MINUTE, MINUTE_MS);
  const byUsername = slidingWindow(WRONG_TRIES_PER_USERNAME_PER_HOUR, HOUR_MS);
  return {
    take(ip, username, now) {
      const wait = Math.max(byIp.waitMs(ip, now), byUsername.waitMs(username, now));
      if (wait > 0) return { allowed: false, retryAfterSeconds: Math.ceil(wait / 1000) };
      byIp.record(ip, now);
      byUsername.record(username, now);
      return { allowed: true, succeeded: () => byUsername.forget(username, now) };
    },
  };
}

declare global {
  // On globalThis for the reason the API limiter is (rate-limit.ts): one limiter per process.
  var spaceshipLoginLimiter: LoginLimiter | undefined;
}

export function loginLimiter(): LoginLimiter {
  globalThis.spaceshipLoginLimiter ??= createLoginLimiter();
  return globalThis.spaceshipLoginLimiter;
}

export function tooManyTries(seconds: number): string {
  return `Too many tries. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}
