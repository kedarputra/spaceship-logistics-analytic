import { type NextRequest, NextResponse } from "next/server";
import { loginPath } from "./auth/next-path";
import { isPublicPath } from "./auth/public-paths";
import { authSecret } from "./auth/secret";
import { SESSION_COOKIE, verifySession } from "./auth/session";
import { NOT_CONFIGURED, SIGNED_OUT } from "./auth/sign-in";
import { errorResponse } from "./app/api/body";
import { apiRateLimiter, ipKey, RATE_LIMIT_MESSAGE } from "./app/api/rate-limit";

/**
 * Next's request proxy, before any page or route runs.
 *
 * 1. The per-IP rate limits on /api/* (ADR 0010 §5). Over a limit, a 429 whose error the page shows
 *    as it shows any API error.
 * 2. The session (ticket 31): every page and API route but the public ones needs a session cookie
 *    with our signature that has not expired. Without one, a page goes to /login with the page to come
 *    back to, and an API route answers 401. Without a usable secret nothing but the public paths
 *    opens. Whether the role may open the page is for the page or route itself (`requireRole`).
 */
export function proxy(request: NextRequest): Response {
  const { pathname, search } = request.nextUrl;
  const now = Date.now();
  const api = pathname.startsWith("/api/");
  if (api) {
    const decision = apiRateLimiter().take(pathname, ipKey(request.headers), now);
    if (!decision.allowed) {
      const refused = errorResponse(429, RATE_LIMIT_MESSAGE);
      refused.headers.set("retry-after", String(decision.retryAfterSeconds));
      return refused;
    }
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const secret = authSecret();
  if (!secret.ok) return api ? errorResponse(503, NOT_CONFIGURED) : NextResponse.redirect(new URL("/login", request.url));
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret.key, now)) return NextResponse.next();
  if (api) return errorResponse(401, SIGNED_OUT);
  // An absolute URL on the request's own host, which Next turns into a relative Location.
  return NextResponse.redirect(new URL(loginPath(`${pathname}${search}`), request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
