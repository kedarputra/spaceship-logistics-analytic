import { type NextRequest, NextResponse } from "next/server";
import { errorResponse } from "./app/api/body";
import { apiRateLimiter, ipKey, RATE_LIMIT_MESSAGE } from "./app/api/rate-limit";

/**
 * Next's request proxy (before any route runs): the per-IP rate limits on /api/* (ADR 0010 §5).
 * Over a limit, a 429 whose error the page shows as it shows any API error.
 */
export function proxy(request: NextRequest): Response {
  const decision = apiRateLimiter().take(request.nextUrl.pathname, ipKey(request.headers), Date.now());
  if (decision.allowed) return NextResponse.next();
  const refused = errorResponse(429, RATE_LIMIT_MESSAGE);
  refused.headers.set("retry-after", String(decision.retryAfterSeconds));
  return refused;
}

export const config = { matcher: "/api/:path*" };
