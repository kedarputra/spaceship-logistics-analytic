import type { GroupFigures } from "@/domain/definitions";
import { formatCount, formatDays, formatPercent, formatUsd } from "@/domain/format";
import type { ScorecardColumn } from "@/tools/network";

/** The warehouse scorecard's headings (ticket 33), on Network and in the monthly report (ticket 34). */
export const SCORECARD_HEADERS: Record<ScorecardColumn, string> = {
  warehouse: "Warehouse",
  order_count: "Orders",
  units: "Units",
  gross_order_value: "Gross value",
  delivered_orders: "Delivered",
  on_time_rate: "On-time rate",
  delay_rate: "Delay rate",
  average_delivery_time: "Avg delivery time",
};

/** A scorecard row's figures in the columns after the name. */
export function scorecardCells(figures: GroupFigures): string[] {
  return [
    formatCount(figures.orders),
    formatCount(figures.units),
    formatUsd(figures.grossValue),
    formatCount(figures.delivered),
    formatPercent(figures.onTimeRate.value),
    formatPercent(figures.delayRate.value),
    formatDays(figures.averageDeliveryDays.value),
  ];
}
