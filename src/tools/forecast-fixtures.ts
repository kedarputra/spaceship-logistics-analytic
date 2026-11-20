import { getDataset } from "@/domain/orders";
import { type ForecastResult, forecastSeries, type MonthUnits, runForecast } from "./forecast";
import { answerForecast, type ForecastAnswer } from "./forecast-answer";
import { forecastSpecSchema } from "./spec";

/**
 * Test fixtures for forecasts: specs run over the dataset, and made-up monthly series, so a test can
 * reach a case the dataset never does.
 */

/** A forecast spec's fields after "tool", validated and run over the dataset; anything but a forecast throws. */
export function forecastOf(fields: Record<string, unknown>): ForecastResult {
  const result = runForecast(forecastSpecSchema.parse({ tool: "forecast", ...fields }), getDataset());
  if (result.kind !== "forecast") throw new Error(result.message);
  return result;
}

/** The same, presented as /api/run answers it. */
export function forecastAnswerOf(fields: Record<string, unknown>): ForecastAnswer {
  const answer = answerForecast(forecastSpecSchema.parse({ tool: "forecast", ...fields }));
  if (answer.kind !== "forecast") throw new Error(answer.message);
  return answer;
}

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
    scopeLabel: "all products",
    period: "1 Jan–31 Dec 2025",
    ...forecastSeries(months2025(values)),
  };
}
