import { loginPath } from "@/auth/next-path";
import { authSecret } from "@/auth/secret";
import { clearedSessionCookie, cookieValue, SESSION_COOKIE, verifySession } from "@/auth/session";
import { importStore } from "../../import-store";
import { errorResponse, readFormBody } from "../body";
import { CROSS_SITE, sameOrigin } from "../origin";

/**
 * POST /api/logout, from the rail's Sign out and the 403 page's "Sign in as someone else" (ticket 31):
 * clears the session cookie and returns to /login, with `next` when the form names a page to come
 * back to. Public, so an expired session can still sign out; from a page of this site only. A valid
 * session's import goes with it (ticket 35); an expired session's import has already gone, since an
 * import never outlives its session.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request.headers)) return errorResponse(403, CROSS_SITE);
  const secret = authSecret();
  const session = secret.ok ? verifySession(cookieValue(request.headers.get("cookie"), SESSION_COOKIE), secret.key, Date.now()) : undefined;
  if (session?.sessionId !== undefined) importStore().remove(session.sessionId);
  const next = (await readFormBody(request)).get("next");
  return new Response(null, {
    status: 303,
    headers: { location: loginPath(next), "set-cookie": clearedSessionCookie(), "cache-control": "no-store" },
  });
}
