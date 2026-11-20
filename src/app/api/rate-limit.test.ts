import { describe, expect, it } from "vitest";
import { ipKey, createApiRateLimiter } from "./rate-limit";

const SECOND = 1000;

/** Takes `count` requests to `path` from one IP at time `at`, returning how many were allowed. */
function takeMany(limiter: ReturnType<typeof createApiRateLimiter>, path: string, key: string, count: number, at: number): number {
  let allowed = 0;
  for (let index = 0; index < count; index++) if (limiter.take(path, key, at).allowed) allowed += 1;
  return allowed;
}

describe("the IP a request counts against (ADR 0010 §5)", () => {
  it("is the CF-Connecting-IP header that cloudflared sets", () => {
    expect(ipKey(new Headers({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(ipKey(new Headers({ "CF-Connecting-IP": " 2001:db8::1 " }))).toBe("2001:db8::1");
  });

  it('is "local" for a request without it, such as a process on the server', () => {
    expect(ipKey(new Headers())).toBe("local");
    expect(ipKey(new Headers({ "cf-connecting-ip": "  " }))).toBe("local");
  });
});

describe("the rate limits: 20 questions and 120 API calls per IP per minute (ADR 0010 §5)", () => {
  it("allows 20 asks in a minute and refuses the 21st, saying when to retry", () => {
    const limiter = createApiRateLimiter();
    expect(takeMany(limiter, "/api/ask", "203.0.113.7", 20, 0)).toBe(20);
    expect(limiter.take("/api/ask", "203.0.113.7", 30 * SECOND)).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });

  it("counts over a sliding minute: a request leaves the window 60 s after it was made", () => {
    const limiter = createApiRateLimiter();
    takeMany(limiter, "/api/ask", "a", 10, 0);
    takeMany(limiter, "/api/ask", "a", 10, 30 * SECOND);
    expect(limiter.take("/api/ask", "a", 59 * SECOND).allowed).toBe(false);
    // The first 10 have left; the 10 from 30 s remain, so 10 more fit.
    expect(takeMany(limiter, "/api/ask", "a", 11, 60 * SECOND)).toBe(10);
  });

  it("keeps each IP apart, and requests without the header share one key", () => {
    const limiter = createApiRateLimiter();
    takeMany(limiter, "/api/ask", "203.0.113.7", 20, 0);
    expect(limiter.take("/api/ask", "198.51.100.2", 0).allowed).toBe(true);
    takeMany(limiter, "/api/ask", "local", 20, 0);
    expect(limiter.take("/api/ask", ipKey(new Headers()), 0).allowed).toBe(false);
  });

  it("allows 120 calls to /api/* in a minute, and counts each ask against both limits", () => {
    const limiter = createApiRateLimiter();
    expect(takeMany(limiter, "/api/run", "a", 121, 0)).toBe(120);
    const mixed = createApiRateLimiter();
    takeMany(mixed, "/api/ask", "b", 20, 0);
    expect(takeMany(mixed, "/api/run", "b", 101, 0)).toBe(100);
    expect(mixed.take("/api/health", "b", 0).allowed).toBe(false);
  });

  it("lets other API calls through when only the ask limit is reached", () => {
    const limiter = createApiRateLimiter();
    takeMany(limiter, "/api/ask", "a", 21, 0);
    expect(limiter.take("/api/run", "a", 0).allowed).toBe(true);
  });

  it("does not count a refused request, so retrying does not push the wait further out", () => {
    const limiter = createApiRateLimiter();
    takeMany(limiter, "/api/ask", "a", 20, 0);
    takeMany(limiter, "/api/ask", "a", 50, 10 * SECOND);
    expect(limiter.take("/api/ask", "a", 60 * SECOND).allowed).toBe(true);
  });
});
