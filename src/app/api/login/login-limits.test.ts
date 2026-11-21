import { describe, expect, it } from "vitest";
import { createLoginLimiter } from "./login-limits";

const MINUTE = 60_000;
const START = Date.UTC(2026, 10, 21, 5, 0, 0);

describe("the sign-in limits (ticket 31)", () => {
  it("allow 5 tries a minute from one IP, then refuse with the wait in seconds until the oldest try is a minute old", () => {
    const limiter = createLoginLimiter();
    const tries = Array.from({ length: 5 }, (_, index) => limiter.take("203.0.113.1", `user${index}`, START + index * 1000));
    expect(tries.every((decision) => decision.allowed)).toBe(true);
    expect(limiter.take("203.0.113.1", "user9", START + 10_000)).toEqual({ allowed: false, retryAfterSeconds: 50 });
    expect(limiter.take("203.0.113.1", "user9", START + MINUTE).allowed).toBe(true);
  });

  it("count every try from an IP, a right password included", () => {
    const limiter = createLoginLimiter();
    for (let index = 0; index < 5; index += 1) {
      const decision = limiter.take("203.0.113.2", "dina", START + index);
      if (decision.allowed) decision.succeeded();
    }
    expect(limiter.take("203.0.113.2", "dina", START + 10).allowed).toBe(false);
  });

  it("allow 10 wrong tries an hour for one username, from any number of IPs, then refuse", () => {
    const limiter = createLoginLimiter();
    for (let index = 0; index < 10; index += 1) {
      expect(limiter.take(`198.51.100.${index}`, "dina", START + index * MINUTE).allowed).toBe(true);
    }
    const refused = limiter.take("198.51.100.99", "dina", START + 10 * MINUTE);
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 50 * 60 });
    expect(limiter.take("198.51.100.99", "budi", START + 10 * MINUTE).allowed).toBe(true);
    expect(limiter.take("198.51.100.98", "dina", START + 60 * MINUTE).allowed).toBe(true);
  });

  it("do not hold a right password against the username, so reviewers sharing a test account are not locked out", () => {
    const limiter = createLoginLimiter();
    for (let index = 0; index < 30; index += 1) {
      const decision = limiter.take(`198.51.100.${index}`, "analyst", START + index * MINUTE);
      expect(decision.allowed).toBe(true);
      if (decision.allowed) decision.succeeded();
    }
  });

  it("report the longer wait when both limits refuse", () => {
    const limiter = createLoginLimiter();
    for (let index = 0; index < 10; index += 1) limiter.take(`198.51.100.${index}`, "dina", START + index);
    for (let index = 0; index < 5; index += 1) limiter.take("203.0.113.3", `other${index}`, START + MINUTE);
    expect(limiter.take("203.0.113.3", "dina", START + MINUTE + 1)).toEqual({ allowed: false, retryAfterSeconds: 59 * 60 });
  });
});
