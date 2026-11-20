import type { DeliveryOutcomes } from "@/domain/definitions";
import type { ChartSeries } from "./chart";
import { SERIES_COLORS } from "./palette";

/** Delivery outcomes in fixed order, so each keeps its color on the dashboard and in answers. */
export const OUTCOME_SERIES: (ChartSeries & { key: keyof DeliveryOutcomes })[] = [
  { key: "onTime", label: "On time", color: SERIES_COLORS.blue },
  { key: "delayed", label: "Delayed", color: SERIES_COLORS.orange },
  { key: "exception", label: "Exception", color: SERIES_COLORS.aqua },
];

/** The five statuses in fixed order; the three delivered ones match their outcome colors. */
export const STATUS_SERIES: ChartSeries[] = [
  { key: "delivered", label: "delivered", color: SERIES_COLORS.blue },
  { key: "delayed", label: "delayed", color: SERIES_COLORS.orange },
  { key: "exception", label: "exception", color: SERIES_COLORS.aqua },
  { key: "in_transit", label: "in transit", color: SERIES_COLORS.yellow },
  { key: "canceled", label: "canceled", color: SERIES_COLORS.magenta },
];
