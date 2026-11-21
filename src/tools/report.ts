import {
  type BucketValue,
  change,
  delayRate,
  deliveredOrdersOverTime,
  type DeliveryOutcomes,
  deliveryOutcomes,
  deliveryOutcomesOverTime,
  exceptionRate,
  type GroupFigures,
  groupFigures,
  onTimeRate,
  ordersBy,
  ordersDatedIn,
  periodFigures,
  pointsChange,
  type Ratio,
  type SkuValue,
  valueChange,
} from "@/domain/definitions";
import type { Dataset, Order } from "@/domain/orders";
import { buckets, dataPeriod, monthsPeriod, type Period } from "@/domain/periods";
import { type AttentionRow, oldestFirst } from "./attention";
import { type CategoryRow, inventory } from "./inventory";
import { periodScorecard, type Scorecard } from "./network";

/**
 * The monthly WMS report (ticket 34): one month of the data in the sections a warehouse report has, and
 * the same figures for the month before. Every figure comes from domain/definitions and the tools the
 * dashboard pages use (inventory, network, attention), so a month here counts what the same month counts
 * there (ADR 0011 §6). Each section reads the date its figures depend on (ADR 0002 §5): orders, units and
 * value by order date, deliveries by delivery date. Pure: no clock, no network, no file.
 */

/** How many categories and SKUs the report shows, by gross value. */
export const TOP_ROWS = 5;

/** A carrier's deliveries completed in the month: its delivered orders, their outcomes and rates. */
export interface CarrierRow {
  carrier: string;
  figures: GroupFigures;
}

/** One month's figures, every section of the report. */
export interface MonthFigures {
  /** YYYY-MM. */
  month: string;
  /** The whole calendar month. */
  period: Period;
  /** Orders, units and gross value placed in the month; delivered orders, rates and average days completed in it. */
  figures: GroupFigures;
  /** The deliveries completed in the month by outcome. */
  outcomes: DeliveryOutcomes;
  /** Each outcome's rate over those deliveries: the on-time rate, the delay rate and the exception rate. */
  outcomeRates: Record<keyof DeliveryOutcomes, Ratio>;
  /** The outcomes per ISO week of delivery, each week clipped to the month (ADR 0002 §4), with its delivered orders. */
  weeks: (BucketValue<DeliveryOutcomes> & { delivered: number })[];
  /** By deliveries completed, most first, ties by name. */
  carriers: CarrierRow[];
  /** Network's scorecard for the month, highest on-time rate first. */
  warehouses: Scorecard;
  /** Every category with orders placed in the month, by gross value, highest first; the month after looks its own up here. */
  categories: CategoryRow[];
  /** The first TOP_ROWS of them: what the report shows. */
  topCategories: CategoryRow[];
  /** Every SKU with orders placed in the month, ranked by gross value. */
  skus: SkuValue[];
  topSkus: SkuValue[];
  /**
   * The orders placed in the month whose status is in transit or canceled, oldest first. Status is as of
   * the anchor date: the data cannot say what was in transit at the end of a past month.
   */
  attention: AttentionRow[];
}

/** How far the summary moved from the month before: counts, units and USD as differences, rates in percentage points, days in days. */
export interface MonthChanges {
  orders: number | null;
  units: number | null;
  grossValue: number;
  delivered: number | null;
  onTimeRate: number | null;
  delayRate: number | null;
  averageDeliveryDays: number | null;
}

export interface MonthlyReport {
  /** The anchor date (ADR 0002): the status of every order is as of this day. */
  anchor: string;
  current: MonthFigures;
  /** The month before, when the data has it; its first month has none. */
  previous: MonthFigures | null;
  /** Null when there is no month before. */
  changes: MonthChanges | null;
}

const ATTENTION_STATUSES: readonly Order["status"][] = ["in_transit", "canceled"];

function carrierRows(delivered: readonly Order[]): CarrierRow[] {
  return [...ordersBy(delivered, (order) => order.carrier)]
    .map(([carrier, carrierOrders]) => ({ carrier, figures: groupFigures(carrierOrders) }))
    .sort((a, b) => b.figures.delivered - a.figures.delivered || a.carrier.localeCompare(b.carrier, "en"));
}

function monthFigures({ orders, anchor }: Dataset, month: string): MonthFigures {
  const period = monthsPeriod(month, month);
  const placed = ordersDatedIn(orders, period, "order_date");
  const delivered = ordersDatedIn(orders, period, "delivery_date");
  const { categories, skus } = inventory(placed);
  const deliveredPerWeek = deliveredOrdersOverTime(orders, period, "week");
  return {
    month,
    period,
    figures: periodFigures(placed, delivered),
    outcomes: deliveryOutcomes(delivered),
    outcomeRates: { onTime: onTimeRate(delivered), delayed: delayRate(delivered), exception: exceptionRate(delivered) },
    // The same weeks of the same period, in the same order.
    weeks: deliveryOutcomesOverTime(orders, period, "week").map((week, index) => ({ ...week, delivered: deliveredPerWeek[index]?.value ?? 0 })),
    carriers: carrierRows(delivered),
    warehouses: periodScorecard(placed, delivered),
    categories,
    topCategories: categories.slice(0, TOP_ROWS),
    skus,
    topSkus: skus.slice(0, TOP_ROWS),
    attention: oldestFirst(
      placed.filter((order) => ATTENTION_STATUSES.includes(order.status)),
      anchor,
    ),
  };
}

function changes(current: GroupFigures, previous: GroupFigures): MonthChanges {
  return {
    orders: change(current.orders, previous.orders),
    units: change(current.units, previous.units),
    grossValue: valueChange(current.grossValue, previous.grossValue),
    delivered: change(current.delivered, previous.delivered),
    onTimeRate: pointsChange(current.onTimeRate, previous.onTimeRate),
    delayRate: pointsChange(current.delayRate, previous.delayRate),
    averageDeliveryDays: change(current.averageDeliveryDays.value, previous.averageDeliveryDays.value),
  };
}

/** The months a report can be made for: every calendar month the data covers, as YYYY-MM, oldest first. */
export function reportMonths(orders: readonly Order[]): string[] {
  return buckets(dataPeriod(orders), "month").map((bucket) => bucket.key.slice(0, 7));
}

/** The report for a month given as YYYY-MM, or undefined when the data does not cover that month. */
export function monthlyReport(dataset: Dataset, month: string): MonthlyReport | undefined {
  const months = reportMonths(dataset.orders);
  const at = months.indexOf(month);
  if (at === -1) return undefined;
  const before = months[at - 1];
  const current = monthFigures(dataset, month);
  const previous = before === undefined ? null : monthFigures(dataset, before);
  return { anchor: dataset.anchor, current, previous, changes: previous === null ? null : changes(current.figures, previous.figures) };
}
