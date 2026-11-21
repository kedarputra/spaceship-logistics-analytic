import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAccounts } from "./auth/testing";
import { RATE_LIMIT_MESSAGE } from "./app/api/rate-limit";
import { config, proxy } from "./proxy";

const accounts = createTestAccounts();
afterAll(() => accounts.remove());

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
});

function visit(path: string, { cookie, ip, method = "GET" }: { cookie?: string; ip?: string; method?: string } = {}): Response {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  if (ip !== undefined) headers["cf-connecting-ip"] = ip;
  return proxy(new NextRequest(`http://localhost${path}`, { method, headers }));
}

/** NextResponse.next(): the request goes on to its route. */
function passedOn(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

/** Where a redirect points, as a path on this site. */
function redirectedTo(response: Response): string | undefined {
  const location = response.headers.get("location");
  if (location === null) return undefined;
  const url = new URL(location, "http://localhost");
  return `${url.pathname}${url.search}`;
}

describe("the proxy's per-IP limits on /api/* (ADR 0010 §5)", () => {
  const ask = (ip: string) => visit("/api/ask", { method: "POST", ip, cookie: accounts.cookie("analyst") });

  it("passes 20 questions a minute from one IP, then answers 429 with the message the page shows", async () => {
    const answers = Array.from({ length: 21 }, () => ask("203.0.113.10"));
    expect(answers.slice(0, 20).every(passedOn)).toBe(true);
    const refused = answers[20];
    expect(refused?.status).toBe(429);
    expect(await refused?.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
  });

  it("does not hold one IP's questions against another's", () => {
    for (let index = 0; index < 21; index++) ask("203.0.113.11");
    expect(passedOn(ask("203.0.113.12"))).toBe(true);
  });

  it("counts requests without a session too, so the sign-in endpoint is limited like the rest", () => {
    for (let index = 0; index < 120; index++) visit("/api/login", { method: "POST", ip: "203.0.113.13" });
    expect(visit("/api/login", { method: "POST", ip: "203.0.113.13" }).status).toBe(429);
  });
});

describe("the proxy's sign-in check (ticket 31)", () => {
  it.each(["/login", "/login?next=%2Fask", "/api/login", "/api/logout", "/api/health", "/api/health?ai=1", "/_next/static/chunks/main.js", "/_next/static/media/figtree.woff2", "/favicon.ico"])(
    "lets %s through without a session",
    (path) => {
      expect(passedOn(visit(path, { ip: "192.0.2.1" }))).toBe(true);
    },
  );

  it("sends a page without a session to /login, with the page to come back to", () => {
    expect(redirectedTo(visit("/ask?q=Which%20carrier"))).toBe("/login?next=%2Fask%3Fq%3DWhich%2520carrier");
    expect(redirectedTo(visit("/data"))).toBe("/login?next=%2Fdata");
    expect(redirectedTo(visit("/"))).toBe("/login");
    expect(visit("/delivery").status).toBe(307);
  });

  it("answers an API route without a session with 401 JSON", async () => {
    for (const path of ["/api/ask", "/api/run", "/api/orders.csv"]) {
      const response = visit(path, { ip: "192.0.2.2" });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "You are signed out. Sign in again." });
      // A refusal depends on who asked, so no shared cache (the tunnel's CDN) may keep it.
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("passes a valid session on to the page or route, which checks the role", () => {
    expect(passedOn(visit("/ask", { cookie: accounts.cookie("viewer") }))).toBe(true);
    expect(passedOn(visit("/api/orders.csv", { cookie: accounts.cookie("viewer"), ip: "192.0.2.3" }))).toBe(true);
  });

  it("treats a tampered or expired session as none", () => {
    const tampered = `session=${accounts.token("viewer")}x`;
    const expired = `session=${accounts.token("viewer", "viewer", Date.now() - 8 * 60 * 60 * 1000)}`;
    for (const cookie of [tampered, expired, "session=", "other=1"]) {
      expect(redirectedTo(visit("/delivery", { cookie }))).toBe("/login?next=%2Fdelivery");
    }
  });

  it("fails closed without a usable secret: pages go to /login, which says so, and API routes answer 503", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(redirectedTo(visit("/forecast", { cookie: accounts.cookie("admin") }))).toBe("/login");
    const api = visit("/api/run", { cookie: accounts.cookie("admin"), ip: "192.0.2.4" });
    expect(api.status).toBe(503);
    expect(api.headers.get("cache-control")).toBe("private, no-store");
    expect(await api.json()).toEqual({ error: "Sign-in isn't configured on this server." });
    expect(passedOn(visit("/api/health", { ip: "192.0.2.4" }))).toBe(true);
  });

  it("runs on every page and API route, and skips only the framework's static files", () => {
    expect(config.matcher).toEqual(["/((?!_next/static|_next/image|favicon.ico).*)"]);
  });
});
