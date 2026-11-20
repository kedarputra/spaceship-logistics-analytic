import type { Ratio } from "./definitions";

/**
 * How numbers are shown (ADR 0001 §7): rates as percentages and days, both to 1 decimal.
 * Computation keeps full precision; only these functions round.
 */

const NOT_AVAILABLE = "n/a";

/** A whole number with an en-US thousands separator: 1310 → "1,310". */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** A rate given as a fraction: 0.8216 → "82.2%". A null rate (zero denominator) → "n/a". */
export function formatPercent(value: number | null): string {
  if (value === null) return NOT_AVAILABLE;
  return `${(value * 100).toFixed(1)}%`;
}

/** A rate's numerator and denominator: "304 / 370". */
export function formatFraction({ numerator, denominator }: Ratio): string {
  return `${formatCount(numerator)} / ${formatCount(denominator)}`;
}

/** 3.83 → "3.8 days". A null average (zero denominator) → "n/a". */
export function formatDays(value: number | null): string {
  if (value === null) return NOT_AVAILABLE;
  return `${value.toFixed(1)} days`;
}
