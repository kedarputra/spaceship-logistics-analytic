/**
 * Chart choice (ADR 0006 §6). Code picks the chart from the shape of the result; the LLM never
 * writes a chart configuration. The dashboard and the answers both call this.
 */

export type ChartType = "answer-card" | "vertical-bars" | "line" | "horizontal-bars" | "stacked-bars";

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
