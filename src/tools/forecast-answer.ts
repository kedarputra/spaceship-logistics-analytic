import { formatCount, formatDecimal, formatPercent } from "@/domain/format";
import { type Dataset, getDataset } from "@/domain/orders";
import { formatDate } from "@/domain/periods";
import type { SentenceSource } from "./answer";
import { type Candidate, type ForecastResult, NOT_A_REORDER, runForecast } from "./forecast";
import type { NoDataResult } from "./query";
import type { ForecastSpec } from "./spec";
import { andList, countOf } from "./words";

/**
 * A forecast as /api/run and /api/ask answer it: the computed result, an opening sentence, the
 * interpretation, and why a rough forecast is rough, all written by code from the result (ADR 0009
 * §4). The facts block holds the figures a sentence may use, formatted as the card shows them on
 * screen, so a model's sentence can be checked against it. Facts are phrases, not labels, because a
 * model copies labels word for word ("The units to plan for is 405").
 */

export interface ForecastAnswer extends ForecastResult {
  /** The model's sentence when it passed the guard, otherwise the code template. */
  sentence: string;
  sentenceSource: SentenceSource;
  interpretation: string;
  /** Why the forecast is labelled rough (ADR 0003 §4); undefined when it is not. */
  roughNote?: string;
}

/** The chosen method's holdout score. */
export function winnerScore(result: ForecastResult): Candidate | undefined {
  return result.candidates.find((candidate) => candidate.method === result.method.id);
}

/** "This forecast is rough: its error on Oct–Dec 2025 was 125.0% of actual demand." */
function roughNoteFor(result: ForecastResult): string | undefined {
  if (!result.method.rough) return undefined;
  const score = winnerScore(result);
  if (score === undefined || score.wape === null) {
    return `This forecast is rough: ${result.holdout} had no demand, and the forecast for them was not 0.`;
  }
  return `This forecast is rough: its error on ${result.holdout} was ${formatPercent(score.wape)} of actual demand.`;
}

/** "demand", "demand for category CRAYON", or for a SKU question "demand for its category, CRAYON,". */
function demandWords(result: ForecastResult): string {
  if (result.sku !== undefined) return `demand for its category, ${result.sku.category},`;
  return result.spec.scope.type === "total" ? "demand" : `demand for ${result.scopeLabel}`;
}

/** "Over Jan–Mar 2026, demand is forecast at 285 units" */
function demandClause(result: ForecastResult): string {
  return `Over ${result.monthsLabel}, ${demandWords(result)} is forecast at ${formatCount(result.recommendation.demand)} units`;
}

/**
 * "In Q2 2026 (Apr–Jun 2026), demand is forecast at 285 units." for months asked about after the
 * first forecast month: the answer to the question, ahead of the plan that runs to them (ticket 23).
 */
function targetSentence(result: ForecastResult): string | undefined {
  const target = result.targetDemand;
  if (target === undefined) return undefined;
  const months = target.label === target.monthsLabel ? "" : ` (${target.monthsLabel})`;
  return `In ${target.label}${months}, ${demandWords(result)} is forecast at ${formatCount(target.units)} units.`;
}

function templateSentence(result: ForecastResult, roughNote: string | undefined): string {
  const { recommendation, sku } = result;
  const skuPart = sku === undefined ? "" : `${sku.id} has ${countOf(sku.orders.length, "order")}, too few to forecast on its own. `;
  const target = targetSentence(result);
  const targetPart = target === undefined ? "" : `${target} `;
  const lastMonth = result.forecastMonths.at(-1)?.label;
  const through = target === undefined || lastMonth === undefined ? "" : `, to have stock through ${lastMonth}`;
  const sentence = `${skuPart}${targetPart}${demandClause(result)}; with ${formatCount(recommendation.safetyStock)} units of safety stock, that is ${formatCount(recommendation.units)} units to plan for${through}.`;
  return roughNote === undefined ? sentence : `${sentence} ${roughNote}`;
}

/**
 * Words a model's sentence must contain, in any case: the scope it is about (for a SKU question,
 * the SKU and its category), and "rough" for a rough forecast (ADR 0003 §4).
 */
export function requiredForecastWords(result: ForecastResult): string[] {
  const { scope } = result.spec;
  const words: string[] = [];
  if (result.sku !== undefined) words.push(result.sku.id, result.sku.category);
  else if (scope.type !== "total") words.push(scope.value);
  if (result.method.rough) words.push("rough");
  return words;
}

/** What the forecast wording check needs (ticket 23): the SKU exactly as the data writes it, and the months asked about. */
export interface ForecastWordingContext {
  skuId?: string;
  /** The names of the months asked about, and their demand as the facts write it. */
  target?: { labels: string[]; units: string };
}

export function forecastWordingContext(result: ForecastResult): ForecastWordingContext {
  const target = result.targetDemand;
  return {
    ...(result.sku === undefined ? {} : { skuId: result.sku.id }),
    ...(target === undefined ? {} : { target: { labels: [target.label, target.monthsLabel], units: formatCount(target.units) } }),
  };
}

function describeForecast(result: ForecastResult): string {
  const scope = result.sku === undefined ? result.scopeLabel : `${result.scopeLabel}, the category of SKU ${result.sku.id}`;
  return `Demand forecast for ${scope}: units ordered per month by order date, ${result.monthsLabel}, from orders ${result.period}.`;
}

function skuFacts(answer: ForecastAnswer): string[] {
  const { sku } = answer;
  if (sku === undefined) return [];
  const orders = andList(sku.orders.map((order) => `${formatDate(order.orderDate)} ${countOf(order.quantity, "unit")}`));
  return [sku.reason, `Its orders: ${orders}, ${countOf(sku.units, "unit")} in all.`];
}

export function forecastFacts(answer: ForecastAnswer): string[] {
  const { recommendation, forecastMonths } = answer;
  const score = winnerScore(answer);
  const target = targetSentence(answer);
  const facts = [
    ...(answer.horizon.reachNote === undefined ? [] : [answer.horizon.reachNote]),
    ...skuFacts(answer),
    ...(target === undefined ? [] : [target]),
    `What is forecast: units ordered per month by order date, for ${answer.scopeLabel}, from orders ${answer.period}.`,
    `The forecast covers ${answer.monthsLabel} (${countOf(answer.horizon.months, "month")}).`,
    `Month by month, the forecast is ${andList(forecastMonths.map((month) => `${month.label} ${formatDecimal(month.units)}`))} units.`,
    `The 95% range is ${andList(forecastMonths.map((month) => `${month.label} ${formatDecimal(month.low)}–${formatDecimal(month.high)}`))} units.`,
    `${demandClause(answer)}.`,
    `${formatCount(recommendation.safetyStock)} units of safety stock cover forecast error at a 95% service level.`,
    `That makes ${formatCount(recommendation.units)} units to plan for. ${NOT_A_REORDER}`,
    answer.method.reason,
  ];
  if (score !== undefined) {
    facts.push(`Its error on ${answer.holdout} was ${formatDecimal(score.mae)} units a month on average, ${formatPercent(score.wape)} of actual demand.`);
  }
  facts.push(answer.roughNote ?? "The forecast is not rough.");
  if (answer.scopeNote !== undefined) facts.push(answer.scopeNote);
  if (answer.januaryCaveat !== undefined) facts.push(answer.januaryCaveat);
  facts.push(...answer.horizon.notes);
  return facts;
}

export function presentForecast(result: ForecastResult): ForecastAnswer {
  const roughNote = roughNoteFor(result);
  return {
    ...result,
    sentence: templateSentence(result, roughNote),
    sentenceSource: "template",
    interpretation: describeForecast(result),
    roughNote,
  };
}

/**
 * A validated forecast spec, run over a dataset and presented: what /api/run and /api/ask both answer
 * with. The routes and pages pass the session's active dataset (ticket 35); the eval and the tests run on the file.
 */
export function answerForecast(spec: ForecastSpec, dataset: Dataset = getDataset()): ForecastAnswer | NoDataResult {
  const result = runForecast(spec, dataset);
  return result.kind === "forecast" ? presentForecast(result) : result;
}
