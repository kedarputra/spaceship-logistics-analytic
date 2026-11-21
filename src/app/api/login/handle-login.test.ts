import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/auth/password";
import { verifySession } from "@/auth/session";
import { createTestAccounts } from "@/auth/testing";
import { handleLogin } from "./handle-login";
import { createLoginLimiter, type LoginLimiter } from "./login-limits";

const accounts = createTestAccounts();
const PASSWORD = "the analyst's long password";
const NOW = Date.UTC(2026, 10, 21, 5, 0, 0);

beforeAll(async () => {
  accounts.write([
    { username: "analyst", role: "analyst", passwordHash: await hashPassword(PASSWORD) },
    { username: "viewer", role: "viewer" },
  ]);
});
afterAll(() => accounts.remove());

let limiter: LoginLimiter;
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
  limiter = createLoginLimiter();
});

function signIn(body: unknown, headers: Record<string, string> = {}, now = NOW): Promise<Response> {
  return handleLogin(
    new Request("http://wms.example/api/login", {
      method: "POST",
      headers: { host: "wms.example", origin: "https://wms.example", "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { limiter, now: () => now },
  );
}

describe("POST /api/login (ticket 31)", () => {
  it("signs in with the right password: a session cookie for the account and its role, and where to go next", async () => {
    const response = await signIn({ username: "Analyst", password: PASSWORD, next: "/ask?q=x" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: "/ask?q=x" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^session=[^;]+; Path=\/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax$/);
    const token = /^session=([^;]+)/.exec(cookie)?.[1];
    const key = Buffer.from(accounts.env.AUTH_SECRET, "base64");
    expect(verifySession(token, key, NOW)).toEqual({ username: "analyst", role: "analyst", expires: NOW + 8 * 60 * 60 * 1000 });
  });

  it("says the same for an unknown username and a wrong password, and sets no cookie", async () => {
    const wrongPassword = await signIn({ username: "analyst", password: "not the password" });
    const unknownUser = await signIn({ username: "nobody", password: PASSWORD });
    const badName = await signIn({ username: "no such user!", password: PASSWORD });
    for (const response of [wrongPassword, unknownUser, badName]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Wrong username or password." });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("follows next only to a relative path on this site", async () => {
    for (const next of ["https://evil.example/", "//evil.example", undefined]) {
      expect(await (await signIn({ username: "analyst", password: PASSWORD, next })).json()).toEqual({ next: "/" });
    }
  });

  it("refuses a request from another site, or with no Origin at all", async () => {
    for (const origin of ["https://evil.example", ""]) {
      const response = await signIn({ username: "analyst", password: PASSWORD }, { origin });
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    // Behind the tunnel the site's name can arrive as X-Forwarded-Host.
    const forwarded = await signIn({ username: "analyst", password: PASSWORD }, { host: "127.0.0.1:4800", "x-forwarded-host": "wms.example" });
    expect(forwarded.status).toBe(200);
  });

  it("allows 5 tries a minute per IP, then 429 with the wait in seconds", async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await signIn({ username: `user${index}`, password: "wrong password" }, {}, NOW + index * 1000)).status).toBe(401);
    }
    const refused = await signIn({ username: "analyst", password: PASSWORD }, {}, NOW + 6000);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("54");
    expect(await refused.json()).toEqual({ error: "Too many tries. Try again in 54 seconds.", retryAfterSeconds: 54 });
    expect(refused.headers.get("set-cookie")).toBeNull();
  });

  it("allows 10 wrong passwords an hour per username, from any IP, then 429 even for the right one", async () => {
    for (let index = 0; index < 10; index += 1) {
      const ip = { "cf-connecting-ip": `198.51.100.${index}` };
      expect((await signIn({ username: "analyst", password: "wrong password" }, ip, NOW + index * 60_000)).status).toBe(401);
    }
    const refused = await signIn({ username: "analyst", password: PASSWORD }, { "cf-connecting-ip": "198.51.100.50" }, NOW + 10 * 60_000);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "Too many tries. Try again in 3000 seconds.", retryAfterSeconds: 3000 });
  });

  it("fails closed when the server has no usable secret or users file", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const response = await signIn({ username: "analyst", password: PASSWORD });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Sign-in isn't configured on this server." });
  });

  it("refuses a body that is not a username and a password", async () => {
    expect((await signIn("not json")).status).toBe(400);
    expect((await signIn({ username: "analyst" })).status).toBe(400);
    expect((await signIn({ username: "", password: "" })).status).toBe(400);
  });

  it("never echoes the password, or a hash, in what it answers", async () => {
    for (const body of [{ username: "analyst", password: "a secret guess" }, { username: "analyst", password: PASSWORD }]) {
      const text = await (await signIn(body)).text();
      expect(text).not.toContain(body.password);
      expect(text).not.toContain("scrypt");
    }
  });
});
