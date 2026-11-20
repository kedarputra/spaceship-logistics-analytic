/**
 * The rail's collapsed or expanded choice, kept per viewer in a cookie (ticket 27). The toggle writes
 * it in the browser; the layout reads it on the server, so the rail is drawn at the right width
 * before the first paint. No imports, so the browser can use it too.
 */

export const RAIL_COOKIE = "rail";

const COLLAPSED = "collapsed";
const EXPANDED = "expanded";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The cookie's value as the server received it; anything but "collapsed" is the expanded rail. */
export function isRailCollapsed(value: string | undefined): boolean {
  return value === COLLAPSED;
}

/** The cookie the toggle writes to document.cookie: every page, for a year, first-party only. */
export function railCookie(collapsed: boolean): string {
  return `${RAIL_COOKIE}=${collapsed ? COLLAPSED : EXPANDED}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
