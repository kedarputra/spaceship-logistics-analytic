/**
 * Where to go after signing in (ticket 31): the `next` the sign-in page was given, followed only when
 * it is a relative path on this site; anything else goes to the Overview. No imports.
 */

const MAX_LENGTH = 2048;
const HOME = "/";
const ORIGIN = "https://this.site.invalid";

export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || next.length > MAX_LENGTH) return HOME;
  // One leading slash and no second one: "//host" and "/\host" are other sites to a browser.
  if (!next.startsWith("/") || next.startsWith("//")) return HOME;
  // No backslash, even encoded, and no control character or space anywhere.
  if (/[\\\s\u0000-\u001f\u007f]|%5c/i.test(next)) return HOME;
  let url: URL;
  try {
    url = new URL(next, ORIGIN);
  } catch {
    return HOME;
  }
  if (url.origin !== ORIGIN || url.pathname === "/login") return HOME;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in page, with the page to come back to when it is one `safeNextPath` follows and not the Overview. */
export function loginPath(next: unknown): string {
  const path = safeNextPath(next);
  return path === HOME ? "/login" : `/login?${new URLSearchParams({ next: path })}`;
}
