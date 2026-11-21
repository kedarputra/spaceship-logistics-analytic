import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clearedSessionCookie, cookieValue, SESSION_SECONDS, sessionCookie, signSession, verifySession } from "./session";

const KEY = randomBytes(32);
const NOON = Date.UTC(2026, 10, 21, 5, 0, 0);
const HOUR = 60 * 60 * 1000;

const token = signSession({ username: "dina", role: "analyst" }, KEY, NOON);

/** The token with its payload swapped for another, keeping the original signature. */
function withPayload(original: string, payload: object): string {
  const [, signature] = original.split(".");
  return `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
}

describe("the session token (ticket 31)", () => {
  it("holds the username, the role, an 8-hour expiry and a random session ID (ticket 35)", () => {
    expect(SESSION_SECONDS).toBe(8 * 60 * 60);
    expect(verifySession(token, KEY, NOON)).toEqual({ username: "dina", role: "analyst", expires: NOON + 8 * HOUR, sessionId: expect.stringMatching(/^[\w-]{22}$/) });
  });

  it("gives every sign-in its own session ID, even the same user's at the same moment", () => {
    const again = signSession({ username: "dina", role: "analyst" }, KEY, NOON);
    expect(verifySession(again, KEY, NOON)?.sessionId).not.toBe(verifySession(token, KEY, NOON)?.sessionId);
  });

  it("still accepts a session signed before session IDs, which has none and so no import", () => {
    const body = Buffer.from(JSON.stringify({ username: "dina", role: "analyst", expires: NOON + HOUR })).toString("base64url");
    const signed = `${body}.${createHmac("sha256", KEY).update(body).digest("base64url")}`;
    expect(verifySession(signed, KEY, NOON)).toEqual({ username: "dina", role: "analyst", expires: NOON + HOUR });
  });

  it("refuses a session ID that is not one this server makes", () => {
    const body = Buffer.from(JSON.stringify({ username: "dina", role: "analyst", expires: NOON + HOUR, sessionId: "../other" })).toString("base64url");
    const signed = `${body}.${createHmac("sha256", KEY).update(body).digest("base64url")}`;
    expect(verifySession(signed, KEY, NOON)).toBeUndefined();
  });

  it("is valid until its expiry and not a moment after", () => {
    expect(verifySession(token, KEY, NOON + 8 * HOUR - 1)?.username).toBe("dina");
    expect(verifySession(token, KEY, NOON + 8 * HOUR)).toBeUndefined();
  });

  it("refuses a tampered payload, even one that only raises the role or the expiry", () => {
    expect(verifySession(withPayload(token, { username: "dina", role: "admin", expires: NOON + 8 * HOUR }), KEY, NOON)).toBeUndefined();
    expect(verifySession(withPayload(token, { username: "dina", role: "analyst", expires: NOON + 99 * HOUR }), KEY, NOON)).toBeUndefined();
    // Another session's ID, to reach its import, is a tampered payload too.
    const sessionId = verifySession(signSession({ username: "dina", role: "analyst" }, KEY, NOON), KEY, NOON)?.sessionId;
    expect(verifySession(withPayload(token, { username: "dina", role: "analyst", expires: NOON + 8 * HOUR, sessionId }), KEY, NOON)).toBeUndefined();
  });

  it("refuses a token signed with another key", () => {
    expect(verifySession(token, randomBytes(32), NOON)).toBeUndefined();
  });

  it("refuses a tampered signature and anything that is not a token", () => {
    const [payload, signature = ""] = token.split(".");
    const flipped = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    for (const bad of [`${payload}.${flipped}`, `${payload}.`, payload ?? "", `${token}.extra`, "", "not a token", undefined]) {
      expect(verifySession(bad, KEY, NOON)).toBeUndefined();
    }
  });

  it("refuses a payload signed with the right key whose role is not one of the three", () => {
    const body = Buffer.from(JSON.stringify({ username: "dina", role: "root", expires: NOON + HOUR })).toString("base64url");
    const signed = `${body}.${createHmac("sha256", KEY).update(body).digest("base64url")}`;
    expect(verifySession(signed, KEY, NOON)).toBeUndefined();
  });
});

describe("the session cookie", () => {
  it("is HttpOnly, Secure, SameSite=Lax, for the whole site, for 8 hours", () => {
    expect(sessionCookie("abc.def")).toBe("session=abc.def; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax");
  });

  it("is cleared with the same attributes and no lifetime", () => {
    expect(clearedSessionCookie()).toBe("session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  });

  it("is read from a Cookie header among others", () => {
    expect(cookieValue("rail=collapsed; session=abc.def; x=1", "session")).toBe("abc.def");
    expect(cookieValue("rail=collapsed", "session")).toBeUndefined();
    expect(cookieValue(null, "session")).toBeUndefined();
    expect(cookieValue("mysession=nope; session=yes", "session")).toBe("yes");
  });
});
