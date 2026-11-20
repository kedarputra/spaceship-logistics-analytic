/**
 * The forecast tool (ADR 0003): monthly units, four candidate methods, the winner chosen per series
 * on a 3-month holdout, and a safety stock from its one-step-ahead errors. Pure: the series comes
 * in as numbers; runForecast reads it from the dataset.
 */

import { unitsOverTime } from "@/domain/definitions";
import { formatDecimal } from "@/domain/format";
import type { Dataset } from "@/domain/orders";
import { dataPeriod, formatMonths, formatPeriod, monthsAfter } from "@/domain/periods";
import type { ForecastSpec } from "./spec";

export type MethodId = "average" | "moving_average" | "regression" | "holt";

/** Simpler first: a tie in holdout error goes to the earlier one (ADR 0003 §3). */
export const METHODS: readonly MethodId[] = ["average", "moving_average", "regression", "holt"];

const MOVING_WINDOW = 3;
const HOLT_ALPHA = 0.3;
const HOLT_BETA = 0.1;
const HOLDOUT_MONTHS = 3;
/** One-step errors start after this many months, for every method (ADR 0003 §7). */
const WARM_UP_MONTHS = 3;

export interface HoldoutScore {
  method: MethodId;
  /** Mean absolute error in units on the held-out months. */
  mae: number;
  /** absoluteError ÷ actualUnits; null when the held-out months sold nothing. */
  wape: number | null;
  /** WAPE's numerator: the absolute errors over the held-out months, summed. */
  absoluteError: number;
  /** WAPE's denominator: the units actually ordered in the held-out months. */
  actualUnits: number;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The mean, or 0 for no values. */
function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

/** Least squares on the month index 1…n: the line's value at each of the next `steps` months. */
function regression(history: readonly number[], steps: number): number[] {
  const n = history.length;
  const xs = history.map((_, index) => index + 1);
  const meanX = mean(xs);
  const meanY = mean(history);
  const spread = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const slope = spread === 0 ? 0 : xs.reduce((sum, x, index) => sum + (x - meanX) * ((history[index] ?? 0) - meanY), 0) / spread;
  const intercept = meanY - slope * meanX;
  return Array.from({ length: steps }, (_, step) => intercept + slope * (n + 1 + step));
}

/** Holt's linear trend, α 0.3, β 0.1, level starting at the first month and trend at 0 (ADR 0003 §2). */
function holt(history: readonly number[], steps: number): number[] {
  let level = history[0] ?? 0;
  let trend = 0;
  for (const value of history.slice(1)) {
    const previous = level;
    level = HOLT_ALPHA * value + (1 - HOLT_ALPHA) * (level + trend);
    trend = HOLT_BETA * (level - previous) + (1 - HOLT_BETA) * trend;
  }
  return Array.from({ length: steps }, (_, step) => level + (step + 1) * trend);
}

/** The next `steps` monthly values after `history`, by one method. Not floored: callers floor at 0. */
export function predict(method: MethodId, history: readonly number[], steps: number): number[] {
  if (history.length === 0) return Array.from({ length: steps }, () => 0);
  switch (method) {
    case "average":
      return Array.from({ length: steps }, () => mean(history));
    case "moving_average":
      return Array.from({ length: steps }, () => mean(history.slice(-MOVING_WINDOW)));
    case "regression":
      return regression(history, steps);
    case "holt":
      return holt(history, steps);
  }
}

/** Each method fitted on all but the last 3 months and scored on those 3 (ADR 0003 §3). */
export function holdoutScores(series: readonly number[]): HoldoutScore[] {
  const training = series.slice(0, -HOLDOUT_MONTHS);
  const actual = series.slice(-HOLDOUT_MONTHS);
  const actualUnits = sum(actual);
  return METHODS.map((method) => {
    const predicted = predict(method, training, actual.length);
    const errors = actual.map((value, index) => Math.abs(value - (predicted[index] ?? 0)));
    const absoluteError = sum(errors);
    return { method, mae: mean(errors), wape: actualUnits === 0 ? null : absoluteError / actualUnits, absoluteError, actualUnits };
  });
}

/** The lowest holdout MAE; a tie goes to the simpler method. */
export function chooseMethod(scores: readonly Pick<HoldoutScore, "method" | "mae">[]): MethodId {
  const ranked = [...scores].sort((a, b) => a.mae - b.mae || METHODS.indexOf(a.method) - METHODS.indexOf(b.method));
  return ranked[0]?.method ?? "average";
}

/**
 * The root mean square of the method's one-step-ahead errors over the history, each month predicted
 * only from the months before it, from the fourth month on (ADR 0003 §7: from April 2025).
 */
export function oneStepSigma(method: MethodId, series: readonly number[]): number {
  const errors: number[] = [];
  for (let month = WARM_UP_MONTHS; month < series.length; month++) {
    const [predicted] = predict(method, series.slice(0, month), 1);
    errors.push((series[month] ?? 0) - (predicted ?? 0));
  }
  return errors.length === 0 ? 0 : Math.sqrt(mean(errors.map((error) => error ** 2)));
}

const MAX_MONTHS = 6;
const DEFAULT_MONTHS = 3;
/** The holdout measures error up to this many months ahead (ADR 0003 §6). */
const MEASURED_MONTHS = HOLDOUT_MONTHS;
const WEEKS_PER_YEAR = 52;
/** One-sided 95% service level for the safety stock; two-sided 95% for the chart's range (ADR 0003 §7–8). */
export const SAFETY_Z = 1.65;
export const RANGE_Z = 1.96;
/** Over this share of actual demand in holdout error, a forecast is labelled rough (ADR 0003 §4). */
const ROUGH_WAPE = 0.5;
const JANUARY_ENDING = "One year of data cannot show whether January repeats.";

/** ADR 0003 §7: the recommendation is units to plan for, never an order to place. */
export const NOT_A_REORDER = "This is not a reorder quantity: the data has no stock on hand.";

export const METHOD_LABELS: Record<MethodId, string> = {
  average: "All-history average",
  moving_average: `${MOVING_WINDOW}-month moving average`,
  regression: "Linear regression",
  holt: "Holt's linear trend",
};

/** One month of units, ordered or forecast. `key` is the month's first day, `label` reads "Jan 2026". */
export interface MonthUnits {
  key: string;
  label: string;
  units: number;
}

/** A forecast month and its 95% range, floored at 0 (ADR 0003 §8). */
export interface ForecastMonth extends MonthUnits {
  low: number;
  high: number;
}

export interface Candidate extends HoldoutScore {
  label: string;
}

/** The months forecast, and why they differ from what was asked, if they do (ADR 0003 §6). */
export interface ForecastHorizon {
  months: number;
  notes: string[];
}

/** The inventory recommendation (ADR 0003 §7): units to plan for over the horizon, never a reorder quantity. */
export interface InventoryRecommendation {
  /** Units to plan for: forecast demand plus safety stock, rounded up. */
  units: number;
  /** Forecast demand over the horizon, rounded. */
  demand: number;
  /** 1.65 × σ × √months: the rest of the units once demand is rounded. */
  safetyStock: number;
}

export interface SeriesForecast {
  history: MonthUnits[];
  forecastMonths: ForecastMonth[];
  /** The months forecast: "Jan–Mar 2026". */
  monthsLabel: string;
  horizon: ForecastHorizon;
  /** The months held out to choose the method: "Oct–Dec 2025". */
  holdout: string;
  /** Every candidate's holdout error, simplest first. */
  candidates: Candidate[];
  method: { id: MethodId; label: string; reason: string; rough: boolean };
  /** The RMSE of the method's one-step-ahead errors behind the safety stock and the range. */
  sigma: number;
  /** The first month with a one-step error, after the warm-up: "Apr 2025". */
  sigmaFrom: string;
  recommendation: InventoryRecommendation;
  /** The recommendation before rounding, for the explanation: forecast demand + 1.65 × σ × √months = total. */
  exact: { demand: number; safetyStock: number; total: number };
  januaryCaveat?: string;
}

export interface ForecastResult extends SeriesForecast {
  kind: "forecast";
  spec: ForecastSpec;
  /** What is forecast: "All products". */
  scopeLabel: string;
  /** The history's dates: "1 Jan–31 Dec 2025". */
  period: string;
}

export interface ForecastUnavailable {
  kind: "unavailable";
  message: string;
}

const NOT_AVAILABLE_YET =
  'Forecasts for one category, warehouse, region or SKU are not available yet. Forecasts of total demand work, such as "Forecast demand for the next 3 months".';

/** "1 month", "6 months". */
export function monthsText(months: number): string {
  return months === 1 ? "1 month" : `${months} months`;
}

/** Months as asked, weeks turned into whole months, capped at 6; the note beyond 3 months comes later. */
function resolveHorizon(requested: ForecastSpec["horizon"]): ForecastHorizon {
  if (requested === undefined) return { months: DEFAULT_MONTHS, notes: [] };
  const notes: string[] = [];
  let months = requested.count;
  if (requested.unit === "week") {
    months = Math.ceil((requested.count * 12) / WEEKS_PER_YEAR);
    notes.push(`The forecast is monthly, so ${requested.count} weeks is shown as ${monthsText(months)}.`);
  }
  if (months > MAX_MONTHS) {
    notes.push(`Forecasts go up to ${MAX_MONTHS} months ahead, so this shows ${MAX_MONTHS} months instead of ${months}.`);
    months = MAX_MONTHS;
  }
  return { months, notes };
}

function isJanuary(month: MonthUnits): boolean {
  return month.key.slice(5, 7) === "01";
}

/** "+11", "−3": the level lift, in whole units. */
function signedUnits(value: number): string {
  const rounded = Math.round(value);
  return rounded < 0 ? `−${Math.abs(rounded)}` : `+${Math.abs(rounded)}`;
}

/**
 * What the winning method does with January's spike (ADR 0003 §5), or undefined when the history
 * has no January. For the average, the lift is the level with January minus the level without it.
 */
export function januaryCaveat(method: MethodId, history: readonly MonthUnits[]): string | undefined {
  const latest = history.filter(isJanuary).at(-1);
  if (latest === undefined) return undefined;
  const year = Number(latest.key.slice(0, 4));
  const spike = `January ${year}'s spike`;
  switch (method) {
    case "average": {
      const rest = history.filter((month) => !isJanuary(month)).map((month) => month.units);
      const lift = rest.length === 0 ? 0 : mean(history.map((month) => month.units)) - mean(rest);
      return `${spike} is averaged into the level (about ${signedUnits(lift)} units a month) instead of being repeated in January ${year + 1}. ${JANUARY_ENDING}`;
    }
    case "moving_average":
      return `${spike} is outside the ${MOVING_WINDOW}-month window, so the forecast does not repeat it. ${JANUARY_ENDING}`;
    case "regression":
    case "holt":
      return `${spike} tilts the fitted trend downward, and the forecast does not repeat it. ${JANUARY_ENDING}`;
  }
}

/** Why this method, stated for this series only (ADR 0003 §4). */
function reasonFor(method: MethodId, level: number, holdout: string, months: number): string {
  switch (method) {
    case "average":
      return `On this series a flat level had the lowest error on ${holdout}: the forecast is the average of all ${months} months, ${formatDecimal(level)} units a month.`;
    case "moving_average":
      return `On this series the ${MOVING_WINDOW}-month moving average had the lowest error on ${holdout}: the forecast is the mean of the last ${MOVING_WINDOW} months, ${formatDecimal(level)} units a month.`;
    case "regression":
      return `On this series a straight-line trend had the lowest error on ${holdout}: the forecast follows the line fitted to all ${months} months.`;
    case "holt":
      return `On this series Holt's linear trend had the lowest error on ${holdout}: the forecast follows its smoothed level and trend.`;
  }
}

function isRough(score: HoldoutScore | undefined): boolean {
  if (score === undefined) return false;
  // No demand in the held-out months: any error at all is too large a share to trust.
  return score.wape === null ? score.mae > 0 : score.wape > ROUGH_WAPE;
}

/** The forecast for one monthly series: method chosen on the holdout, refit on all months, floored at 0. */
export function forecastSeries(history: readonly MonthUnits[], requested?: ForecastSpec["horizon"]): SeriesForecast {
  const series = history.map((month) => month.units);
  const scores = holdoutScores(series);
  const winner = chooseMethod(scores);
  const sigma = oneStepSigma(winner, series);
  const horizon = resolveHorizon(requested);
  const predicted = predict(winner, series, horizon.months);
  const last = history.at(-1);
  const forecastBuckets = last === undefined ? [] : monthsAfter(last.key, horizon.months);
  const forecastMonths = forecastBuckets.map((bucket, index): ForecastMonth => {
    const units = Math.max(0, predicted[index] ?? 0);
    const spread = RANGE_Z * sigma * Math.sqrt(index + 1);
    return { key: bucket.key, label: bucket.label, units, low: Math.max(0, units - spread), high: units + spread };
  });

  const lastMeasured = forecastMonths[MEASURED_MONTHS - 1];
  const notes = [...horizon.notes];
  if (forecastMonths.length > MEASURED_MONTHS && lastMeasured !== undefined) {
    notes.push(`The error was measured only up to ${MEASURED_MONTHS} months ahead, so the months after ${lastMeasured.label} are less certain.`);
  }

  const held = history.slice(-HOLDOUT_MONTHS);
  const firstHeld = held[0];
  const holdout = firstHeld === undefined || last === undefined ? "" : formatMonths(firstHeld.key, last.key);
  const first = forecastMonths[0];
  const final = forecastMonths.at(-1);
  const demand = sum(forecastMonths.map((month) => month.units));
  const safetyStock = SAFETY_Z * sigma * Math.sqrt(horizon.months);
  const total = demand + safetyStock;
  const unitsToPlanFor = Math.ceil(total);
  const roundedDemand = Math.round(demand);

  return {
    history: [...history],
    forecastMonths,
    monthsLabel: first === undefined || final === undefined ? "" : formatMonths(first.key, final.key),
    horizon: { months: horizon.months, notes },
    holdout,
    candidates: scores.map((score) => ({ ...score, label: METHOD_LABELS[score.method] })),
    method: {
      id: winner,
      label: METHOD_LABELS[winner],
      reason: reasonFor(winner, first?.units ?? 0, holdout, history.length),
      rough: isRough(scores.find((score) => score.method === winner)),
    },
    sigma,
    sigmaFrom: history[WARM_UP_MONTHS]?.label ?? "",
    recommendation: { units: unitsToPlanFor, demand: roundedDemand, safetyStock: unitsToPlanFor - roundedDemand },
    exact: { demand, safetyStock, total },
    januaryCaveat: forecastMonths.some(isJanuary) ? januaryCaveat(winner, history) : undefined,
  };
}

/** Runs a validated forecast spec over the dataset. It forecasts the total; any other scope gets a message that it is not available. */
export function runForecast(spec: ForecastSpec, dataset: Dataset): ForecastResult | ForecastUnavailable {
  if (spec.scope.type !== "total") return { kind: "unavailable", message: NOT_AVAILABLE_YET };
  const coverage = dataPeriod(dataset.orders);
  const history = unitsOverTime(dataset.orders, coverage, "month").map(({ bucket, value }) => ({
    key: bucket.key,
    label: bucket.label,
    units: value,
  }));
  return { kind: "forecast", spec, scopeLabel: "All products", period: formatPeriod(coverage), ...forecastSeries(history, spec.horizon) };
}
