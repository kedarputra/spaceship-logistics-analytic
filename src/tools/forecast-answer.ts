import { formatCount, formatDecimal, formatPercent } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import type { SentenceSource } from "./answer";
import {
  type Candidate,
  type ForecastMonth,
  type ForecastResult,
  type ForecastUnavailable,
  monthsText,
  NOT_A_REORDER,
  runForecast,
} from "./forecast";
import type { ForecastSpec } from "./spec";

/**
 * A forecast as /api/run and /api/ask answer it: the computed result, an opening sentence, the
 * interpretation, and why a rough forecast is rough, all written by code from the result (ADR 0009
 * §4). The facts block holds the figures a sentence may use, formatted as the card shows them on
 * screen, so a model's sentence can be checked against it.
 */

export interface ForecastAnswer extends ForecastResult {
  /** The model's sentence when it passed the guard, otherwise the code template. */
  sentence: string;
  sentenceSource: SentenceSource;
  interpretation: string;
  /** Why the forecast is labelled rough (ADR 0003 §4); undefined when it is not. */
  roughNote?: string;
}

function winnerScore(result: ForecastResult): Candidate | undefined {
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

function templateSentence(result: ForecastResult, roughNote: string | undefined): string {
  const { recommendation } = result;
  const sentence = `Over ${result.monthsLabel}, demand is forecast at ${formatCount(recommendation.demand)} units; with ${formatCount(recommendation.safetyStock)} units of safety stock, that is ${formatCount(recommendation.units)} units to plan for.`;
  return roughNote === undefined ? sentence : `${sentence} ${roughNote}`;
}

/** Words a model's sentence must contain: "rough" for a rough forecast (ADR 0003 §4). */
export function requiredForecastWords(result: ForecastResult): string[] {
  return result.method.rough ? ["rough"] : [];
}

function describeForecast(result: ForecastResult): string {
  return `Demand forecast for ${result.scopeLabel.toLowerCase()}: units ordered per month by order date, ${result.monthsLabel}, from orders ${result.period}.`;
}

function perMonth(months: readonly ForecastMonth[], value: (month: ForecastMonth) => string): string {
  return months.map((month) => `${month.label} ${value(month)}`).join(", ");
}

export function forecastFacts(answer: ForecastAnswer): string[] {
  const { recommendation, forecastMonths } = answer;
  const score = winnerScore(answer);
  const facts = [
    `Forecast: units ordered per month by order date, ${answer.scopeLabel.toLowerCase()}, from orders ${answer.period}.`,
    `Months forecast: ${answer.monthsLabel} (${monthsText(answer.horizon.months)}).`,
    `Forecast per month: ${perMonth(forecastMonths, (month) => formatDecimal(month.units))}.`,
    `95% range per month: ${perMonth(forecastMonths, (month) => `${formatDecimal(month.low)}–${formatDecimal(month.high)}`)}.`,
    `Forecast demand over ${answer.monthsLabel}: ${formatCount(recommendation.demand)} units.`,
    `Safety stock: ${formatCount(recommendation.safetyStock)} units (95% service level).`,
    `Units to plan for: ${formatCount(recommendation.units)}. ${NOT_A_REORDER}`,
    `Method: ${answer.method.label}. ${answer.method.reason}`,
  ];
  if (score !== undefined) {
    facts.push(`Error on ${answer.holdout}: ${formatDecimal(score.mae)} units a month on average, ${formatPercent(score.wape)} of actual demand.`);
  }
  facts.push(answer.roughNote === undefined ? "Rough: no." : `Rough: yes. ${answer.roughNote}`);
  if (answer.januaryCaveat !== undefined) facts.push(`January: ${answer.januaryCaveat}`);
  for (const note of answer.horizon.notes) facts.push(`Note: ${note}`);
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

/** A validated forecast spec, run over the dataset and presented: what /api/run and /api/ask both answer with. */
export function answerForecast(spec: ForecastSpec): ForecastAnswer | ForecastUnavailable {
  const result = runForecast(spec, getDataset());
  return result.kind === "forecast" ? presentForecast(result) : result;
}
