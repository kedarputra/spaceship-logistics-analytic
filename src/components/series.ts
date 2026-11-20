import type { DeliveryOutcomes } from "@/domain/definitions";
import type { MetricInfo } from "@/tools/query";
import type { ChartSeries } from "./chart";
import { MARKS, STATUS_MARKS } from "./palette";

/**
 * Delivery outcomes in fixed order, so each keeps its mark on the Overview and in answers. `mark` is
 * the same colour as a token class, for marks drawn in HTML.
 */
export const OUTCOME_SERIES: (ChartSeries & { key: keyof DeliveryOutcomes; mark: string })[] = [
  { key: "onTime", label: "On time", color: MARKS.onTime, mark: "bg-mark-on-time" },
  { key: "delayed", label: "Delayed", color: MARKS.delayed, mark: "bg-mark-delayed" },
  { key: "exception", label: "Exception", color: MARKS.exception, mark: "bg-mark-exception" },
];

/** The five statuses in fixed order; the three delivered ones match their outcome marks. */
export const STATUS_SERIES: ChartSeries[] = [
  { key: "delivered", label: "Delivered", color: MARKS.onTime },
  { key: "delayed", label: "Delayed", color: MARKS.delayed },
  { key: "exception", label: "Exception", color: MARKS.exception },
  { key: "in_transit", label: "In transit", color: STATUS_MARKS.inTransit },
  { key: "canceled", label: "Canceled", color: STATUS_MARKS.canceled },
];

/** The mark a single series takes (ADR 0011 §3): amber for delay rates and delayed counts, green for every other. */
export type Tone = "amber" | "green";

export function toneOf(metric: MetricInfo["id"]): Tone {
  return metric === "delay_rate" || metric === "delayed_orders" ? "amber" : "green";
}

/** One series in its metric's mark, with the small-sample fill: a ringed light amber, or sage. */
export function singleSeries(metric: MetricInfo["id"], label: string): ChartSeries {
  return toneOf(metric) === "amber"
    ? { key: "value", label, color: MARKS.delayed, mutedColor: MARKS.smallAmber, mutedRing: MARKS.delayed }
    : { key: "value", label, color: MARKS.onTime, mutedColor: MARKS.smallGreen };
}
