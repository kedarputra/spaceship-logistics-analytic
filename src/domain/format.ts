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
      return `${(value * 100).toFixed(decimals)}%`;
    case "days":
      return `${value.toFixed(decimals)} days`;
  }
}

/** A rate given as a fraction: 0.8216 → "82.2%". */
export function formatPercent(value: number | null): string {
  return formatMetricValue(value, "percent");
}

/** 3.83 → "3.8 days". */
export function formatDays(value: number | null): string {
  return formatMetricValue(value, "days");
}

/** A rate's numerator and denominator: "304 / 370". */
export function formatFraction({ numerator, denominator }: Ratio): string {
  return `${formatCount(numerator)} / ${formatCount(denominator)}`;
}
