/**
 * The forecast tool (ADR 0003): monthly units, four candidate methods, the winner chosen per series
 * on a 3-month holdout, and a safety stock from its one-step-ahead errors. Pure: the series comes
 * in as numbers; runForecast reads it from the dataset.
 */

import { mostOrdersOfOneSku, units, unitsOverTime } from "@/domain/definitions";
import { formatDecimal } from "@/domain/format";
import type { Dataset, Order } from "@/domain/orders";
import { dataPeriod, formatMonths, formatPeriod, monthKey, monthsAfter, monthsBetween, type Period } from "@/domain/periods";
import type { NoDataResult } from "./query";
import type { ForecastSpec } from "./spec";
import { matchValue } from "./values";
import { countOf } from "./words";

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
export const DEFAULT_MONTHS = 3;
/** The holdout measures error up to this many months ahead (ADR 0003 §6). */
const MEASURED_MONTHS = HOLDOUT_MONTHS;
const WEEKS_PER_YEAR = 52;
/** One-sided 95% service level for the safety stock; two-sided 95% for the chart's range (ADR 0003 §7–8). */
export const SAFETY_Z = 1.65;
export const RANGE_Z = 1.96;
/** Over this share of actual demand in holdout error (WAPE), a forecast is labelled rough (ADR 0003 §4). */
export const ROUGH_WAPE = 0.5;
const JANUARY_ENDING = "One year of data cannot show whether January repeats.";

/** ADR 0003 §7: the recommendation is units to plan for, never an order to place. */
export const NOT_A_REORDER = "This is not a reorder quantity: the data has no stock on hand.";

/** ADR 0003 §9, as the pages say it: a SKU question gets the SKU's orders and its category's forecast. */
export const SKU_NOT_FORECAST = "A single SKU is never forecast: each has too few orders. A SKU question gets its orders and its category's forecast.";

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
  /** Said before anything else when every month asked about lies beyond the 6-month reach (ticket 14). */
  reachNote?: string;
}

/** A forecast target (GLOSSARY): the months a question names, as their first and last month, and its name. */
export interface TargetMonths {
  label: string;
  from: string;
  to: string;
}

/**
 * What was asked, resolved: the months to forecast, and the target months when they start after the
 * first forecast month ("in Q2"), so their own demand leads the answer (ticket 23).
 */
type ResolvedHorizon = { horizon: ForecastHorizon; target?: TargetMonths } | { past: string };

/** A SKU's own orders, and why it is not forecast on its own (ADR 0003 §9). */
export interface SkuHistory {
  id: string;
  category: string;
  orders: { orderId: string; orderDate: string; quantity: number; warehouse: string }[];
  /** Units over all its orders. */
  units: number;
  reason: string;
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
  /** The z behind the safety stock, for its 95% service level: safety stock = z × σ × √months. */
  safetyZ: number;
  /** The first month with a one-step error, after the warm-up: "Apr 2025". */
  sigmaFrom: string;
  recommendation: InventoryRecommendation;
  /** The recommendation before rounding, for the explanation: forecast demand + 1.65 × σ × √months = total. */
  exact: { demand: number; safetyStock: number; total: number };
  /** The demand in the months asked about, rounded, when they start after the first forecast month (ticket 23). */
  targetDemand?: { label: string; monthsLabel: string; units: number };
  januaryCaveat?: string;
}

export interface ForecastResult extends SeriesForecast {
  kind: "forecast";
  spec: ForecastSpec;
  /** What is forecast, as it reads mid-sentence: "all products", "category CRAYON". */
  scopeLabel: string;
  /** Something true of this scope that changes how to read it: a region served by one warehouse. */
  scopeNote?: string;
  /** For a SKU question: the SKU's own orders; the forecast is its category's. */
  sku?: SkuHistory;
  /** The history's dates: "1 Jan–31 Dec 2025". */
  period: string;
}

/** The series a forecast runs on: a SKU question is answered with its category's. */
type SeriesScope = { type: "total" } | { type: "category" | "warehouse" | "region"; value: string };

const SCOPE_FIELDS = { category: "product_category", warehouse: "warehouse", region: "region" } as const;
const SKU_FORMAT = "SKU IDs are a category and a number, for example CRAYON-0008.";
const DEFAULT_HORIZON: ForecastHorizon = { months: DEFAULT_MONTHS, notes: [] };

/** Months as asked, weeks turned into whole months, capped at 6; the note beyond 3 months comes later. */
function countHorizon(requested: NonNullable<ForecastSpec["horizon"]>): ForecastHorizon {
  const notes: string[] = [];
  let months = requested.count;
  if (requested.unit === "week") {
    months = Math.ceil((requested.count * 12) / WEEKS_PER_YEAR);
    notes.push(`The forecast is monthly, so ${requested.count} weeks is shown as ${countOf(months, "month")}.`);
  }
  if (months > MAX_MONTHS) {
    notes.push(`Forecasts go up to ${MAX_MONTHS} months ahead, so this shows ${MAX_MONTHS} months instead of ${months}.`);
    months = MAX_MONTHS;
  }
  return { months, notes };
}

type Target = NonNullable<ForecastSpec["target"]>;

/** The year a quarter or month without one is read in: the next one that ends on or after the first forecast month. */
function nextYear(lastMonth: number, firstMonth: string): number {
  const year = Number(firstMonth.slice(0, 4));
  return monthKey(year, lastMonth) >= firstMonth ? year : year + 1;
}

/** The first and last month a target covers, and its name: "2027", "Q3 2026", "Mar 2026". */
function targetMonths(target: Target, firstMonth: string): TargetMonths {
  switch (target.type) {
    case "year":
      return { from: monthKey(target.year, 1), to: monthKey(target.year, 12), label: String(target.year) };
    case "quarter": {
      const lastMonth = 3 * target.quarter;
      const year = target.year ?? nextYear(lastMonth, firstMonth);
      return { from: monthKey(year, lastMonth - 2), to: monthKey(year, lastMonth), label: `Q${target.quarter} ${year}` };
    }
    case "month": {
      const key = monthKey(target.year ?? nextYear(target.month, firstMonth), target.month);
      return { from: key, to: key, label: formatMonths(key, key) };
    }
  }
}

/**
 * The months that reach a target, from the first forecast month and at most 6 (ticket 14). Wholly
 * beyond the reach, the answer says so first and shows the furthest months it can.
 */
function targetHorizon(target: Target, firstMonth: string): ResolvedHorizon {
  const asked = targetMonths(target, firstMonth);
  const { from, to, label } = asked;
  const reachEnd = monthsAfter(firstMonth, MAX_MONTHS - 1).at(-1)?.key ?? firstMonth;
  const reach = formatMonths(reachEnd, reachEnd);
  if (to < firstMonth) {
    const start = formatMonths(firstMonth, firstMonth);
    return { past: `${label} is before the forecast, which starts in ${start}. Past demand is a question about orders, such as "Units ordered by month".` };
  }
  if (from > reachEnd) return { horizon: { months: MAX_MONTHS, notes: [], reachNote: `The forecast reaches ${reach} at most; ${label} is beyond it.` } };
  if (to > reachEnd) return { horizon: { months: MAX_MONTHS, notes: [`The forecast reaches ${reach} at most, so it covers only part of ${label}.`] } };
  const months = monthsBetween(firstMonth, to) + 1;
  if (from <= firstMonth) return { horizon: { months, notes: [] } };
  return { horizon: { months, notes: [`To reach ${label}, the forecast covers ${formatMonths(firstMonth, to)}.`] }, target: asked };
}

/** The first month after the data, where every forecast starts. */
function firstForecastMonth(coverage: Period): string {
  return monthsAfter(coverage.to, 1)[0]?.key ?? coverage.to;
}

/** A target's months as the forecast tool reads them over a dataset, its year filled in when the question left it out. */
export function resolveTargetMonths(target: Target, dataset: Dataset): TargetMonths {
  return targetMonths(target, firstForecastMonth(dataPeriod(dataset.orders)));
}

/** The months to forecast for what was asked, starting with `firstMonth` (ADR 0003 §6). */
function resolveHorizon(spec: Pick<ForecastSpec, "horizon" | "target">, firstMonth: string): ResolvedHorizon {
  if (spec.target !== undefined) return targetHorizon(spec.target, firstMonth);
  return { horizon: spec.horizon === undefined ? DEFAULT_HORIZON : countHorizon(spec.horizon) };
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
  if (score.wape === null) return score.mae > 0;
  return score.wape > ROUGH_WAPE;
}

/** The forecast for one monthly series: method chosen on the holdout, refit on all months, floored at 0. */
export function forecastSeries(history: readonly MonthUnits[], horizon: ForecastHorizon = DEFAULT_HORIZON, target?: TargetMonths): SeriesForecast {
  const series = history.map((month) => month.units);
  const scores = holdoutScores(series);
  const winner = chooseMethod(scores);
  const sigma = oneStepSigma(winner, series);
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
  const inTarget = target === undefined ? [] : forecastMonths.filter((month) => month.key >= target.from && month.key <= target.to);
  const safetyStock = SAFETY_Z * sigma * Math.sqrt(horizon.months);
  const total = demand + safetyStock;
  const unitsToPlanFor = Math.ceil(total);
  const roundedDemand = Math.round(demand);

  return {
    history: [...history],
    forecastMonths,
    monthsLabel: first === undefined || final === undefined ? "" : formatMonths(first.key, final.key),
    horizon: { ...horizon, notes },
    targetDemand:
      target === undefined
        ? undefined
        : { label: target.label, monthsLabel: formatMonths(target.from, target.to), units: Math.round(sum(inTarget.map((month) => month.units))) },
    holdout,
    candidates: scores.map((score) => ({ ...score, label: METHOD_LABELS[score.method] })),
    method: {
      id: winner,
      label: METHOD_LABELS[winner],
      reason: reasonFor(winner, first?.units ?? 0, holdout, history.length),
      rough: isRough(scores.find((score) => score.method === winner)),
    },
    sigma,
    safetyZ: SAFETY_Z,
    sigmaFrom: history[WARM_UP_MONTHS]?.label ?? "",
    recommendation: { units: unitsToPlanFor, demand: roundedDemand, safetyStock: unitsToPlanFor - roundedDemand },
    exact: { demand, safetyStock, total },
    januaryCaveat: forecastMonths.some(isJanuary) ? januaryCaveat(winner, history) : undefined,
  };
}

/** A SKU's orders, oldest first, and why it is not forecast, or undefined for a SKU not in the data. Any case matches. */
function skuHistory(input: string, orders: readonly Order[]): SkuHistory | undefined {
  const id = matchValue(input, [...new Set(orders.map((order) => order.sku))], false);
  if (id === undefined) return undefined;
  const own = orders
    .filter((order) => order.sku === id)
    .sort((a, b) => a.order_date.localeCompare(b.order_date) || a.order_id.localeCompare(b.order_id));
  const category = own[0]?.product_category ?? "";
  const most = mostOrdersOfOneSku(orders);
  return {
    id,
    category,
    orders: own.map((order) => ({ orderId: order.order_id, orderDate: order.order_date, quantity: order.quantity, warehouse: order.warehouse })),
    units: units(own),
    reason: `${id} has ${countOf(own.length, "order")} in the data, too few to forecast on its own: no SKU has more than ${most}. The forecast is for its category, ${category}, and is not split by SKU.`,
  };
}

function ordersIn(scope: SeriesScope, orders: readonly Order[]): Order[] {
  if (scope.type === "total") return [...orders];
  const field = SCOPE_FIELDS[scope.type];
  return orders.filter((order) => order[field] === scope.value);
}

/** ADR 0003 §1: a region with one warehouse has that warehouse's forecast (UK and LON-FC1). */
function scopeNoteFor(scope: SeriesScope, orders: readonly Order[]): string | undefined {
  if (scope.type !== "region") return undefined;
  const warehouses = [...new Set(orders.map((order) => order.warehouse))];
  const [only] = warehouses;
  if (warehouses.length !== 1 || only === undefined) return undefined;
  return `${scope.value} is served only by warehouse ${only}, so this forecast is the same as warehouse ${only}'s.`;
}

/**
 * Runs a validated forecast spec over the dataset: the total, one category, warehouse or region, or
 * a SKU's history with its category's forecast (ADR 0003 §1, §9). An unknown SKU, or months asked
 * about that are already past, get a message instead.
 */
export function runForecast(spec: ForecastSpec, dataset: Dataset): ForecastResult | NoDataResult {
  let scope: SeriesScope;
  let sku: SkuHistory | undefined;
  if (spec.scope.type === "sku") {
    sku = skuHistory(spec.scope.value, dataset.orders);
    if (sku === undefined) return { kind: "no-data", message: `No SKU ${spec.scope.value} in the data. ${SKU_FORMAT}` };
    scope = { type: "category", value: sku.category };
  } else {
    scope = spec.scope;
  }

  const coverage = dataPeriod(dataset.orders);
  const orders = ordersIn(scope, dataset.orders);
  const history = unitsOverTime(orders, coverage, "month").map(({ bucket, value }) => ({ key: bucket.key, label: bucket.label, units: value }));
  const firstMonth = firstForecastMonth(coverage);
  const resolved = resolveHorizon(spec, firstMonth);
  if ("past" in resolved) return { kind: "no-data", message: resolved.past };

  return {
    kind: "forecast",
    spec,
    scopeLabel: scope.type === "total" ? "all products" : `${scope.type} ${scope.value}`,
    scopeNote: scopeNoteFor(scope, orders),
    sku,
    period: formatPeriod(coverage),
    ...forecastSeries(history, resolved.horizon, resolved.target),
  };
}
