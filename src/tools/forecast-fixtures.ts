import { type ForecastResult, forecastSeries, type MonthUnits } from "./forecast";
import { forecastSpecSchema } from "./spec";

/** Test fixtures for forecasts: made-up monthly series, so a test can reach a case the dataset's total never does. */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Flat at 10, then 0, 40, 0 on the held-out months: every method predicts 10, so the average wins a tie at WAPE 125%. */
export const ROUGH_SERIES = [10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 40, 0];

/** Months of 2025 from January, with the given units. */
export function months2025(values: readonly number[]): MonthUnits[] {
  return values.map((units, index) => ({
    key: `2025-${String(index + 1).padStart(2, "0")}-01`,
    label: `${MONTH_NAMES[index]} 2025`,
    units,
  }));
}

/** A forecast of total demand over a made-up series of 2025, as runForecast would return it. */
export function forecastResultFor(values: readonly number[]): ForecastResult {
  return {
    kind: "forecast",
    spec: forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" } }),
    scopeLabel: "All products",
    period: "1 Jan–31 Dec 2025",
    ...forecastSeries(months2025(values)),
  };
}
