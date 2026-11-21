/**
 * The check on every request that changes state (ticket 31): sign-in, sign-out, and later import.
 * A page on another site cannot forge what the browser says about where a request came from:
 *
 * - Sec-Fetch-Site, which current browsers send on every request, must be "same-origin". It does not
 *   depend on the Host header, so a proxy that rewrites Host cannot break sign-in.
 * - Without it (an older browser), the Origin a browser sends on every POST must name the host the
 *   request was sent to: X-Forwarded-Host when the tunnel sets it, else Host, as Next's own server
 *   actions read it.
 */

export const CROSS_SITE = "This request did not come from this site.";

export function sameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = headers.get("origin");
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
