import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MAX_USERNAME_LENGTH } from "./credentials";
import { ROLES } from "./roles";

/**
 * The session (ticket 31, ADR 0012): a cookie that holds the username, the role, an 8-hour expiry and,
 * since ticket 35, a random session ID that the session's import is kept under. It is signed with
 * HMAC-SHA256 under the server's secret (AUTH_SECRET_FILE or AUTH_SECRET), and proves who signed in and
 * when; what they may do now is read from the users file on every request (`requireRole`), so a removed
 * account or a changed role applies at once.
 */

export const SESSION_COOKIE = "session";
export const SESSION_SECONDS = 8 * 60 * 60;

const sessionSchema = z.object({
  username: z.string().min(1).max(MAX_USERNAME_LENGTH),
  role: z.enum(ROLES),
  /** When it ends, in ms since the epoch. */
  expires: z.number().int().positive(),
  /**
   * 16 random bytes, base64url, new at every sign-in (ticket 35): what the session's import is kept
   * under. A session signed before ticket 35 has none, and so no import.
   */
  sessionId: z
    .string()
    .regex(/^[\w-]{22}$/)
    .optional(),
});

export type Session = z.infer<typeof sessionSchema>;

function signature(payload: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

/** `<payload>.<signature>`, both base64url: the payload is the session as JSON. */
export function signSession(user: Pick<Session, "username" | "role">, key: Buffer, now: number): string {
  const session: Session = {
    username: user.username,
    role: user.role,
    expires: now + SESSION_SECONDS * 1000,
    sessionId: randomBytes(16).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}

/** The session a token holds, if its signature is ours and it has not expired; otherwise undefined. */
export function verifySession(token: string | undefined, key: Buffer, now: number): Session | undefined {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 2) return undefined;
  const [payload = "", signed = ""] = parts;
  const given = Buffer.from(signed, "base64url");
  const expected = signature(payload, key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  const session = sessionSchema.safeParse(parsed);
  if (!session.success || session.data.expires <= now) return undefined;
  return session.data;
}

/** The Set-Cookie value for the session cookie holding `value`, kept for `maxAge` seconds. */
function setCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** The Set-Cookie value that signs a browser in. */
export function sessionCookie(token: string): string {
  return setCookie(token, SESSION_SECONDS);
}

/** The Set-Cookie value that signs a browser out. */
export function clearedSessionCookie(): string {
  return setCookie("", 0);
}

/** One cookie's value from a Cookie request header. */
export function cookieValue(header: string | null, name: string): string | undefined {
  for (const pair of header?.split(";") ?? []) {
    const at = pair.indexOf("=");
    if (at !== -1 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}
