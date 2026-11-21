/**
 * What opens without signing in (ticket 31): the sign-in page and its two endpoints, the health check
 * the monitors read (ADR 0010 §6), and the framework's static files and fonts. Signing out is public
 * so that an expired session can still do it. No imports.
 */

export const PUBLIC_PATHS = ["/login", "/api/login", "/api/logout", "/api/health"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => path === pathname) || pathname.startsWith("/_next/") || pathname === "/favicon.ico";
}
