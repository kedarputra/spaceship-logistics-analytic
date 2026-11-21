import type { MetricDefinition, Ratio } from "./definitions";

/**
 * How numbers are shown (ADR 0001 §7): rates as percentages and days, both to 1 decimal on
 * screen and 2 in the explanation table. Computation keeps full precision; only these functions
 * round.
 */

const NOT_AVAILABLE = "n/a";

/** A whole number with an en-US thousands separator: 1310 → "1,310". */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * `value` to `decimals` places with an exact half rounded up, even where floating point leaves it a hair
 * below: 29 ÷ 400 × 100 is 7.2499…, and 7.25% must read 7.3% like 9 ÷ 400 reads 2.3%.
 */
function toFixedHalfUp(value: number, decimals: number): string {
  const scaled = Number((value * 10 ** decimals).toPrecision(12));
  return (Math.round(scaled) / 10 ** decimals).toFixed(decimals);
}

/**
 * A metric value by its unit. Counts stay whole, money keeps its cents, rates and days take
 * `decimals`. A null value (zero denominator) is "n/a".
 */
export function formatMetricValue(value: number | null, unit: MetricDefinition["unit"], decimals: 1 | 2 = 1): string {
  if (value === null) return NOT_AVAILABLE;
  switch (unit) {
    case "orders":
    case "units":
      return formatCount(value);
    case "USD":
      return `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent":
      return `${toFixedHalfUp(value * 100, decimals)}%`;
    case "days":
      return `${toFixedHalfUp(value, decimals)} days`;
  }
}

/** An amount in US dollars as a table shows it: 26.22 → "$26.22", 1234.5 → "$1,234.50". */
export function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A forecast or an error in units, to 1 decimal on screen and 2 in an explanation: 95 → "95.0",
 * 1234.56 → "1,234.6". To 0 decimals for a plan read in whole units: 176.6 → "177".
 */
export function formatDecimal(value: number, decimals: 0 | 1 | 2 = 1): string {
  return Number(toFixedHalfUp(value, decimals)).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A threshold or an axis tick as a percentage, without a trailing ".0": 0.5 → "50%", 0.0725 → "7.3%". */
export function formatPercentPlain(value: number): string {
  return `${Number(toFixedHalfUp(value * 100, 1))}%`;
}

/** A rate given as a fraction: 0.8216 → "82.2%". */
export function formatPercent(value: number | null): string {
  return formatMetricValue(value, "percent");
}

/** 3.83 → "3.8 days". */
export function formatDays(value: number | null): string {
  return formatMetricValue(value, "days");
}

/** The unit a change is shown in: a rate's change in percentage points, the rest in their own unit. */
export type ChangeUnit = Exclude<MetricDefinition["unit"], "percent"> | "points";

/** How each unit's change is rounded and written, from its size. */
const CHANGE_UNITS: Record<ChangeUnit, { decimals: number; write: (size: number) => string }> = {
  orders: { decimals: 0, write: formatCount },
  units: { decimals: 0, write: formatCount },
  USD: { decimals: 2, write: formatUsd },
  points: { decimals: 1, write: (size) => `${size.toFixed(1)} points` },
  days: { decimals: 1, write: (size) => `${size.toFixed(1)} days` },
};

/**
 * A change against the period before (ticket 34), signed, with a minus sign for a fall: "+2.4 points",
 * "−2", "+$688.96", "+0.4 days". Its size is rounded as the figure itself is shown, an exact half away
 * from zero either way, and a change that rounds to nothing has no sign. "n/a" with nothing to compare.
 */
export function formatChange(value: number | null, unit: ChangeUnit): string {
  if (value === null) return NOT_AVAILABLE;
  const { decimals, write } = CHANGE_UNITS[unit];
  const size = Number(toFixedHalfUp(Math.abs(value), decimals));
  return size === 0 ? write(size) : `${value > 0 ? "+" : "−"}${write(size)}`;
}

/** A rate's numerator and denominator in words: "304 of 370". */
export function formatOf({ numerator, denominator }: Pick<Ratio, "numerator" | "denominator">): string {
  return `${formatCount(numerator)} of ${formatCount(denominator)}`;
}

/** A rate's numerator and denominator: "304 / 370". */
export function formatFraction({ numerator, denominator }: Ratio): string {
  return `${formatCount(numerator)} / ${formatCount(denominator)}`;
}
