/**
 * Chart choice (ADR 0006 §6). Code picks the chart from the shape of the result; the LLM never
 * writes a chart configuration. The dashboard and the answers both call this.
 */

export type ChartType = "answer-card" | "vertical-bars" | "line" | "horizontal-bars" | "stacked-bars";

/** Each chart in words, for the pipeline trace. */
export const CHART_NAMES: Record<ChartType, string> = {
  "answer-card": "answer card",
  "vertical-bars": "vertical bars",
  line: "line",
  "horizontal-bars": "horizontal bars",
  "stacked-bars": "stacked bars",
};

/** Horizontal bars beyond this many go to the table only ("N more in the table"). */
export const MAX_CATEGORY_BARS = 12;

export interface ResultShape {
  /** What the result is grouped by: nothing, a week/month/day, or a category such as carrier. */
  dimension: "none" | "time" | "category";
  /** Count-like (orders, outcomes, units, value), a rate, or an average. */
  measure: "count" | "rate" | "average";
  /** The values are parts of one whole, such as delivery outcomes or a status breakdown. */
  shareOfWhole?: boolean;
}

export function chooseChart({ dimension, measure, shareOfWhole = false }: ResultShape): ChartType {
  if (dimension === "none") return "answer-card";
  if (shareOfWhole) return "stacked-bars";
  if (dimension === "category") return "horizontal-bars";
  return measure === "count" ? "vertical-bars" : "line";
}

const WITH_ARTICLE: Record<ResultShape["measure"], string> = { count: "a count", rate: "a rate", average: "an average" };

/** Why this chart (B5, ADR 0008 §4): one sentence from the same rules chooseChart follows. */
export function chartReason(shape: ResultShape): string {
  const { measure } = shape;
  switch (chooseChart(shape)) {
    case "answer-card":
      return "One value → the number itself: a chart of one point adds nothing.";
    case "stacked-bars":
      return "Parts of one whole → stacked bars, so the parts add up to the total.";
    case "horizontal-bars":
      return `Category + ${measure} → horizontal bars, ranked, so the names stay readable.`;
    case "vertical-bars":
      return "Time + count → vertical bars: each period's count stands on its own.";
    case "line":
      return `Time + ${measure} → a line, so the trend shows; ${WITH_ARTICLE[measure]} is not added up across periods.`;
  }
}

/** The forecast's chart is fixed by ADR 0003 §8. */
export const FORECAST_CHART_REASON =
  "History + forecast → a line, the forecast dashed with its 95% range shaded, so it reads as an estimate (ADR 0003 §8).";
