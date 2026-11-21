/**
 * Responses that depend on who is signed in are never stored by a shared cache (ADR 0012, amended). The
 * tunnel's CDN caches by file extension, .pdf and .csv among them, unless told not to: without this, it
 * served one analyst's report file to a viewer without the request ever reaching the role check.
 * `private` keeps shared caches out; `no-store` keeps the browser from keeping a copy either.
 */

export const PRIVATE_NO_STORE = "private, no-store";

/** The response with Cache-Control: private, no-store; a copy when its headers cannot be changed. */
export function privateNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", PRIVATE_NO_STORE);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
