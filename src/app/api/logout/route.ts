import { loginPath } from "@/auth/next-path";
import { clearedSessionCookie } from "@/auth/session";
import { errorResponse, readFormBody } from "../body";
import { CROSS_SITE, sameOrigin } from "../origin";

/**
 * POST /api/logout, from the rail's Sign out and the 403 page's "Sign in as someone else" (ticket 31):
 * clears the session cookie and returns to /login, with `next` when the form names a page to come
 * back to. Public, so an expired session can still sign out; from a page of this site only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request.headers)) return errorResponse(403, CROSS_SITE);
  const next = (await readFormBody(request)).get("next");
  return new Response(null, {
    status: 303,
    headers: { location: loginPath(next), "set-cookie": clearedSessionCookie(), "cache-control": "no-store" },
  });
}
