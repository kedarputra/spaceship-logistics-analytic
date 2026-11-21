/**
 * A motion token's duration as script needs it (ticket 30), read from the page's CSS, so a viewer who
 * asked for reduced motion gets 0 here too. No imports, so the browser can use it.
 */

/** A CSS time in milliseconds: "280ms", or ".28s" as the build minifies it; 0 for anything else. */
export function durationMs(value: string): number {
  const match = /^\s*([\d.]+)(ms|s)\s*$/.exec(value);
  if (match === null) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(match[2] === "s" ? amount * 1000 : amount);
}

export function motionMs(token: "--dur-1" | "--dur-2" | "--dur-3"): number {
  return durationMs(getComputedStyle(document.documentElement).getPropertyValue(token));
}
