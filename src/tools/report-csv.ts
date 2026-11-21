import { cents, type DeliveryOutcomes, type GroupFigures, groupFigures, type MetricId } from "@/domain/definitions";
import { csvLine } from "@/domain/csv";
import type { Order } from "@/domain/orders";
import type { MonthFigures, MonthlyReport } from "./report";

/**
 * The monthly report as one CSV file (ticket 34): a row per figure, named by the report section, the item
 * it is about ("all" for the whole month), and its metric as METRICS names it. Values are the computed
 * numbers, never formatted text: rates as fractions, days unrounded, money to the cent. previous_month is
 * the same figure for the month before, empty when there is no month before or the figure has no value
 * there (a rate with nothing delivered). Every cell goes through the shared csvField, so no cell can start
 * a spreadsheet formula.
 */

export const REPORT_CSV_HEADER = ["section", "item", "metric", "value", "previous_month"] as const;

interface CsvRow {
  section: string;
  item: string;
  metric: MetricId;
  value: number | null;
  /** Undefined when there is no month before. */
  previous?: number | null;
}

/** A figure as the CSV writes it: USD to the cent, the rest as computed, nothing for no value. */
function csvNumber(value: number | null | undefined, metric: MetricId): string {
  if (value === null || value === undefined) return "";
  return String(metric === "gross_order_value" ? cents(value) / 100 : value);
}

function line({ section, item, metric, value, previous }: CsvRow): string {
  return csvLine([section, item, metric, csvNumber(value, metric), csvNumber(previous, metric)]);
}

/** What an item placed in the month adds up to: a group's figures, or a SKU's. */
type Placed = Pick<GroupFigures, "orders" | "units" | "grossValue">;

/** The metrics of the orders placed, and where any group or SKU holds them. */
const PLACED_FIGURES = {
  order_count: (placed) => placed.orders,
  units: (placed) => placed.units,
  gross_order_value: (placed) => placed.grossValue,
} as const satisfies Partial<Record<MetricId, (placed: Placed) => number>>;
type PlacedMetric = keyof typeof PLACED_FIGURES;

/** The metrics a group's figures hold, and where. */
const FIGURES = {
  ...PLACED_FIGURES,
  delivered_orders: (figures) => figures.delivered,
  on_time_deliveries: (figures) => figures.onTimeRate.numerator,
  delayed_orders: (figures) => figures.delayRate.numerator,
  on_time_rate: (figures) => figures.onTimeRate.value,
  delay_rate: (figures) => figures.delayRate.value,
  average_delivery_time: (figures) => figures.averageDeliveryDays.value,
} as const satisfies Partial<Record<MetricId, (figures: GroupFigures) => number | null>>;
type FigureMetric = keyof typeof FIGURES;

const SUMMARY: readonly FigureMetric[] = ["order_count", "units", "gross_order_value", "delivered_orders", "on_time_rate", "delay_rate", "average_delivery_time"];
const CARRIER: readonly FigureMetric[] = ["delivered_orders", "on_time_deliveries", "delayed_orders", "on_time_rate"];

/**
 * A group's rows, one per metric, beside its figures the month before: `null` when it had no orders
 * there, which are the figures of no orders (counts 0, rates none); `undefined` when there is no month before.
 */
function groupRows(section: string, item: string, figures: GroupFigures, previous: GroupFigures | null | undefined, metrics: readonly FigureMetric[]): CsvRow[] {
  const before = previous === null ? groupFigures([]) : previous;
  return metrics.map((metric) => ({ section, item, metric, value: FIGURES[metric](figures), previous: before === undefined ? undefined : FIGURES[metric](before) }));
}

const OUTCOMES: readonly [keyof DeliveryOutcomes, MetricId][] = [
  ["onTime", "on_time_deliveries"],
  ["delayed", "delayed_orders"],
  ["exception", "exception_orders"],
];

function outcomeRows(section: string, item: string, outcomes: DeliveryOutcomes, previous?: DeliveryOutcomes): CsvRow[] {
  return OUTCOMES.map(([key, metric]) => ({ section, item, metric, value: outcomes[key], previous: previous?.[key] }));
}

/** An item's figures in the month before: null when it has none there, undefined when there is no month before. */
function inMonthBefore<T>(previous: MonthFigures | null, find: (month: MonthFigures) => T | undefined): T | null | undefined {
  return previous === null ? undefined : (find(previous) ?? null);
}

/** A top category's or SKU's rows: its orders, units and value placed, beside the month before's (none placed: 0). */
function placedRows(section: string, item: string, placed: Placed, previous: Placed | null | undefined): CsvRow[] {
  const before = previous === null ? groupFigures([]) : previous;
  return (Object.keys(PLACED_FIGURES) as PlacedMetric[]).map((metric) => ({
    section,
    item,
    metric,
    value: PLACED_FIGURES[metric](placed),
    previous: before === undefined ? undefined : PLACED_FIGURES[metric](before),
  }));
}

function attentionCount(month: MonthFigures, status: Order["status"]): number {
  return month.attention.filter(({ order }) => order.status === status).length;
}

function rows({ current, previous }: MonthlyReport): CsvRow[] {
  return [
    ...groupRows("summary", "all", current.figures, previous?.figures, SUMMARY),
    ...outcomeRows("delivery_outcomes", "all", current.outcomes, previous?.outcomes),
    // A week has no counterpart in the month before.
    ...current.weeks.flatMap(({ bucket, value, delivered }) => [
      { section: "delivery_outcomes_by_week", item: bucket.key, metric: "delivered_orders" as const, value: delivered },
      ...outcomeRows("delivery_outcomes_by_week", bucket.key, value),
    ]),
    ...current.carriers.flatMap(({ carrier, figures }) =>
      groupRows("carriers", carrier, figures, inMonthBefore(previous, (month) => month.carriers.find((row) => row.carrier === carrier)?.figures), CARRIER),
    ),
    ...current.warehouses.rows.flatMap(({ warehouse, figures }) =>
      groupRows("warehouses", warehouse, figures, inMonthBefore(previous, (month) => month.warehouses.rows.find((row) => row.warehouse === warehouse)?.figures), SUMMARY),
    ),
    ...current.topCategories.flatMap(({ category, figures }) =>
      placedRows("top_categories", category, figures, inMonthBefore(previous, (month) => month.categories.find((row) => row.category === category)?.figures)),
    ),
    ...current.topSkus.flatMap((sku) => placedRows("top_skus", sku.sku, sku, inMonthBefore(previous, (month) => month.skus.find((row) => row.sku === sku.sku)))),
    ...(["in_transit", "canceled"] as const).map((status) => ({
      section: "needs_attention",
      item: status,
      metric: "order_count" as const,
      value: attentionCount(current, status),
      previous: previous === null ? undefined : attentionCount(previous, status),
    })),
  ];
}

/** The report as CSV: the header, then a line per figure, each ending in a line break. */
export function reportCsv(report: MonthlyReport): string {
  return `${[csvLine(REPORT_CSV_HEADER), ...rows(report).map(line)].join("\n")}\n`;
}
