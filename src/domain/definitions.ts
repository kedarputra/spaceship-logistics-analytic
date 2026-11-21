import type { Order } from "./orders";
import { type Bucket, type BucketUnit, daysBetween, groupByBucket, type Period } from "./periods";

/**
 * The one home of the KPI definitions (ADR 0001, Reading B). The dashboard and the query tool
 * both call these functions, so the same question always gets the same number.
 */

/** A delivered order: one with a delivery date (status delivered, delayed, or exception). */
export type DeliveredOrder = Order & { delivery_date: string };

/** The statuses of a delivered order: the 370 of Reading B. */
export const DELIVERED_STATUSES = ["delivered", "delayed", "exception"] as const satisfies readonly Order["status"][];

/** How delivered orders turned out. Every delivered order has exactly one outcome. */
export interface DeliveryOutcomes {
  /** status = delivered */
  onTime: number;
  /** status = delayed ("delivered late") */
  delayed: number;
  /** status = exception: neither on time nor delayed */
  exception: number;
}

/** A value computed by division, kept with its parts so the UI can show them. */
export interface Ratio {
  numerator: number;
  denominator: number;
  /** numerator ÷ denominator at full precision, or null when the denominator is 0. */
  value: number | null;
}

export interface DashboardKpis {
  /** Every order; those not delivered are in transit or canceled. */
  totalOrders: { count: number; inTransit: number; canceled: number; notDelivered: number };
  deliveredOrders: { count: number } & DeliveryOutcomes;
  /** Delayed orders, and their share of delivered orders: delayed ÷ delivered. */
  delayedOrders: { count: number; delayRate: Ratio };
  /** On-time deliveries ÷ delivered orders. */
  onTimeRate: Ratio;
  /** Total delivery days ÷ delivered orders. */
  averageDeliveryDays: Ratio;
}


/** Divides with a guard: a zero denominator gives a null value, never NaN or Infinity. */
export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

export function isDelivered(order: Order): order is DeliveredOrder {
  return order.delivery_date !== null;
}

export function deliveredOrders(orders: readonly Order[]): DeliveredOrder[] {
  return orders.filter(isDelivered);
}

export function deliveryOutcomes(orders: readonly Order[]): DeliveryOutcomes {
  const delivered = deliveredOrders(orders);
  return {
    onTime: delivered.filter((order) => order.status === "delivered").length,
    delayed: delivered.filter((order) => order.status === "delayed").length,
    exception: delivered.filter((order) => order.status === "exception").length,
  };
}

/** delivery_date − order_date in whole calendar days. */
export function deliveryDays(order: DeliveredOrder): number {
  return daysBetween(order.order_date, order.delivery_date);
}

export function onTimeRate(orders: readonly Order[]): Ratio {
  return ratio(deliveryOutcomes(orders).onTime, deliveredOrders(orders).length);
}

export function averageDeliveryDays(orders: readonly Order[]): Ratio {
  const delivered = deliveredOrders(orders);
  const totalDays = delivered.reduce((sum, order) => sum + deliveryDays(order), 0);
  return ratio(totalDays, delivered.length);
}

/** Units ordered: the sum of quantity. */
export function units(orders: readonly Order[]): number {
  return orders.reduce((sum, order) => sum + order.quantity, 0);
}

/** order_value_usd as given, before any promo discount (docs/data.md trap 6). */
export function grossOrderValue(orders: readonly Order[]): number {
  return orders.reduce((sum, order) => sum + order.order_value_usd, 0);
}

/** order_value_usd after the promo discount. */
export function netOrderValue(orders: readonly Order[]): number {
  return orders.reduce((sum, order) => sum + order.order_value_usd * (1 - order.promo_discount_pct / 100), 0);
}

export type MetricId =
  | "order_count"
  | "delivered_orders"
  | "on_time_deliveries"
  | "delayed_orders"
  | "exception_orders"
  | "on_time_rate"
  | "delay_rate"
  | "average_delivery_time"
  | "units"
  | "gross_order_value"
  | "net_order_value";

export type DateField = "order_date" | "delivery_date";

interface MetricBase {
  label: string;
  /** One line, in the glossary's wording. */
  definition: string;
  /** The date a period filters on (ADR 0002 §5). */
  dateField: DateField;
}

/**
 * Counts and sums are plain numbers; rates and averages keep their numerator and denominator.
 * A count also names the orders it counts, so an answer can list them.
 */
export type MetricDefinition =
  | (MetricBase & {
      kind: "count";
      unit: "orders";
      matching: (orders: readonly Order[]) => Order[];
      compute: (orders: readonly Order[]) => number;
    })
  | (MetricBase & { kind: "sum"; unit: "units" | "USD"; compute: (orders: readonly Order[]) => number })
  | (MetricBase & { kind: "rate"; unit: "percent"; compute: (orders: readonly Order[]) => Ratio })
  | (MetricBase & { kind: "average"; unit: "days"; compute: (orders: readonly Order[]) => Ratio });

/** Rates and averages divide by delivered orders, so they carry n and can be small samples. */
export function isRateOrAverage(kind: MetricDefinition["kind"]): boolean {
  return kind === "rate" || kind === "average";
}

/** A count metric over the orders `select` picks. */
function countOf(
  base: MetricBase,
  select: (orders: readonly Order[]) => Order[],
): Extract<MetricDefinition, { kind: "count" }> {
  return { ...base, kind: "count", unit: "orders", matching: select, compute: (orders) => select(orders).length };
}

function deliveredWithStatus(status: Order["status"]): (orders: readonly Order[]) => Order[] {
  return (orders) => deliveredOrders(orders).filter((order) => order.status === status);
}

/** The metric whitelist of ADR 0006 §1: one definition each, used by the dashboard and the query tool. */
export const METRICS: Record<MetricId, MetricDefinition> = {
  order_count: countOf(
    {
      label: "Orders",
      definition: "Every order in the data, including in-transit and canceled orders.",
      dateField: "order_date",
    },
    (orders) => [...orders],
  ),
  delivered_orders: countOf(
    {
      label: "Delivered orders",
      definition: "Orders with a delivery date: status delivered, delayed, or exception.",
      dateField: "delivery_date",
    },
    deliveredOrders,
  ),
  on_time_deliveries: countOf(
    { label: "On-time deliveries", definition: "Delivered orders with status delivered.", dateField: "delivery_date" },
    deliveredWithStatus("delivered"),
  ),
  delayed_orders: countOf(
    {
      label: "Delayed orders",
      definition: "Delivered orders with status delayed. Exception orders are not delayed orders.",
      dateField: "delivery_date",
    },
    deliveredWithStatus("delayed"),
  ),
  exception_orders: countOf(
    {
      label: "Exception orders",
      definition: "Delivered orders with status exception: neither on time nor delayed.",
      dateField: "delivery_date",
    },
    deliveredWithStatus("exception"),
  ),
  on_time_rate: {
    label: "On-time delivery rate",
    definition: "On-time deliveries divided by delivered orders.",
    dateField: "delivery_date",
    kind: "rate",
    unit: "percent",
    compute: onTimeRate,
  },
  delay_rate: {
    label: "Delay rate",
    definition: "Delayed orders divided by delivered orders.",
    dateField: "delivery_date",
    kind: "rate",
    unit: "percent",
    compute: delayRate,
  },
  average_delivery_time: {
    label: "Average delivery time",
    definition: "Mean of delivery date − order date in days, over delivered orders.",
    dateField: "delivery_date",
    kind: "average",
    unit: "days",
    compute: averageDeliveryDays,
  },
  units: {
    label: "Units",
    definition: "Units ordered: the sum of quantity.",
    dateField: "order_date",
    kind: "sum",
    unit: "units",
    compute: units,
  },
  gross_order_value: {
    label: "Gross order value",
    definition: "Order value as given, before promo discounts.",
    dateField: "order_date",
    kind: "sum",
    unit: "USD",
    compute: grossOrderValue,
  },
  net_order_value: {
    label: "Net order value",
    definition: "Order value after the promo discount: value × (1 − discount %).",
    dateField: "order_date",
    kind: "sum",
    unit: "USD",
    compute: netOrderValue,
  },
};

/** The built-in breakdown of ADR 0006 §3: delivered orders split by outcome, over time. */
export const DELIVERY_OUTCOMES_DEFINITION = {
  label: "Delivery outcomes",
  definition: "Delivered orders split into on time, delayed, and exception.",
  dateField: "delivery_date",
} as const satisfies MetricBase;

/**
 * Orders that match a question's filters (and group) as a share of all orders in the same period,
 * whatever their filters (ADR 0006 §1, amended): "22 of 400 orders were promo orders, 5.5%".
 */
export const ORDER_SHARE_DEFINITION = {
  label: "Share of orders",
  definition: "Orders that match the question, as a share of all orders in the same period.",
  dateField: "order_date",
} as const satisfies MetricBase;

/**
 * The statuses of the orders each metric is computed over, as a status filter picks them (ticket 29):
 * what a count counts, the delivered orders a rate or an average divides by, and every status
 * (undefined) for the order count, a sum and the share of orders. Raw data opens a figure's orders
 * with these. Delivered is defined by the delivery date; in the data that is exactly status delivered,
 * delayed or exception (docs/data.md), which a test checks.
 */
export const METRIC_STATUSES: Record<MetricId | "delivery_outcomes" | "order_share", readonly Order["status"][] | undefined> = {
  order_count: undefined,
  delivered_orders: DELIVERED_STATUSES,
  on_time_deliveries: ["delivered"],
  delayed_orders: ["delayed"],
  exception_orders: ["exception"],
  on_time_rate: DELIVERED_STATUSES,
  delay_rate: DELIVERED_STATUSES,
  average_delivery_time: DELIVERED_STATUSES,
  units: undefined,
  gross_order_value: undefined,
  net_order_value: undefined,
  delivery_outcomes: DELIVERED_STATUSES,
  order_share: undefined,
};

/** The share of orders: the orders that match ÷ every order in the same period. */
export function orderShare(matchingOrders: number, ordersInPeriod: number): Ratio {
  return ratio(matchingOrders, ordersInPeriod);
}

/** Each KPI card's name and its one-line definition, taken from the metric whitelist. */
export const KPI_DEFINITIONS: Record<keyof DashboardKpis, { label: string; definition: string }> = {
  totalOrders: { label: "Total orders", definition: METRICS.order_count.definition },
  deliveredOrders: labelOf("delivered_orders"),
  delayedOrders: labelOf("delayed_orders"),
  onTimeRate: labelOf("on_time_rate"),
  averageDeliveryDays: labelOf("average_delivery_time"),
};

function labelOf(id: MetricId): { label: string; definition: string } {
  const { label, definition } = METRICS[id];
  return { label, definition };
}

/** A group with fewer delivered orders than this is a small sample (ADR 0001 §6). */
export const SMALL_SAMPLE_MIN_DELIVERED = 20;

/** Delayed orders ÷ delivered orders. Exception orders are in the denominator only. */
export function delayRate(orders: readonly Order[]): Ratio {
  return ratio(deliveryOutcomes(orders).delayed, deliveredOrders(orders).length);
}

/** Exception orders ÷ delivered orders: the share of deliveries something went wrong with, not counted as delayed. */
export function exceptionRate(orders: readonly Order[]): Ratio {
  return ratio(deliveryOutcomes(orders).exception, deliveredOrders(orders).length);
}

/** The most orders any one SKU has; too few for any SKU to be forecast on its own (ADR 0003 §9). 0 for no orders. */
export function mostOrdersOfOneSku(orders: readonly Order[]): number {
  const perSku = new Map<string, number>();
  for (const order of orders) perSku.set(order.sku, (perSku.get(order.sku) ?? 0) + 1);
  return Math.max(0, ...perSku.values());
}

/** A metric's value in one week or month. */
export interface BucketValue<T> {
  bucket: Bucket;
  value: T;
}

function perBucket<T>(
  orders: readonly Order[],
  dateOf: (order: Order) => string | null,
  period: Period,
  unit: BucketUnit,
  measure: (orders: Order[]) => T,
): BucketValue<T>[] {
  return groupByBucket(orders, dateOf, period, unit).map(({ bucket, items }) => ({ bucket, value: measure(items) }));
}

/** Units ordered per month (or week), dated by order_date: the demand series a forecast reads (ADR 0003 §1). */
export function unitsOverTime(orders: readonly Order[], period: Period, unit: BucketUnit): BucketValue<number>[] {
  return perBucket(orders, (order) => order.order_date, period, unit, units);
}

/** Orders per week or month, dated by order_date (ADR 0002 §5). Every status counts. */
export function orderCountOverTime(orders: readonly Order[], period: Period, unit: BucketUnit): BucketValue<number>[] {
  return perBucket(orders, (order) => order.order_date, period, unit, (items) => items.length);
}

/** Delivery outcomes per week or month, dated by delivery_date (ADR 0002 §5). */
export function deliveryOutcomesOverTime(
  orders: readonly Order[],
  period: Period,
  unit: BucketUnit,
): BucketValue<DeliveryOutcomes>[] {
  return perBucket(orders, (order) => order.delivery_date, period, unit, deliveryOutcomes);
}

/**
 * Transit age (ticket 32): how long an order with status in_transit has been on its way, from its order
 * date to the anchor date (ADR 0002), in whole days. Any other order has none.
 */
export function transitAge(order: Order, anchor: string): number | null {
  return order.status === "in_transit" ? daysBetween(order.order_date, anchor) : null;
}

/**
 * The longest completed delivery (ticket 32): the largest delivery time among delivered orders, 12
 * days in the file. It comes from the orders given, so another file gets its own. None when nothing
 * has been delivered.
 */
export function longestCompletedDelivery(orders: readonly Order[]): number | null {
  const delivered = deliveredOrders(orders);
  return delivered.length === 0 ? null : Math.max(...delivered.map(deliveryDays));
}

/**
 * Overdue in transit (ticket 32): orders in transit longer than the longest completed delivery, in file
 * order. The data has no promised date (docs/data.md trap 2), so this is the honest threshold: older
 * than any order that ever arrived. With nothing delivered there is nothing to compare with, so none.
 */
export function overdueInTransit(orders: readonly Order[], anchor: string): Order[] {
  const longest = longestCompletedDelivery(orders);
  if (longest === null) return [];
  return orders.filter((order) => {
    const age = transitAge(order, anchor);
    return age !== null && age > longest;
  });
}

/** The age buckets of orders in transit (ticket 32), in days: 0–7, 8–14, 15–30 and 31 or more. */
const TRANSIT_AGE_BUCKETS: readonly { label: string; min: number; max?: number }[] = [
  { label: "0–7", min: 0, max: 7 },
  { label: "8–14", min: 8, max: 14 },
  { label: "15–30", min: 15, max: 30 },
  { label: "31+", min: 31 },
];

/** One age bucket, "8–14", and how many orders in transit are in it. */
export interface TransitAgeBucket {
  label: string;
  count: number;
}

/** How many orders in transit fall in each age bucket, in the buckets' order. */
export function transitAgeBuckets(orders: readonly Order[], anchor: string): TransitAgeBucket[] {
  const ages = orders.map((order) => transitAge(order, anchor)).filter((age) => age !== null);
  return TRANSIT_AGE_BUCKETS.map(({ label, min, max }) => ({
    label,
    count: ages.filter((age) => age >= min && (max === undefined || age <= max)).length,
  }));
}

/** The five KPI cards of R1. In-transit and canceled orders count only toward total orders. */
export function dashboardKpis(orders: readonly Order[]): DashboardKpis {
  const outcomes = deliveryOutcomes(orders);
  return {
    totalOrders: {
      count: orders.length,
      inTransit: orders.filter((order) => order.status === "in_transit").length,
      canceled: orders.filter((order) => order.status === "canceled").length,
      notDelivered: orders.filter((order) => !isDelivered(order)).length,
    },
    deliveredOrders: { count: deliveredOrders(orders).length, ...outcomes },
    delayedOrders: { count: outcomes.delayed, delayRate: delayRate(orders) },
    onTimeRate: onTimeRate(orders),
    averageDeliveryDays: averageDeliveryDays(orders),
  };
}

/** The ABC classes of SKUs by value (ticket 33): A the few that make most of it, C the long tail. */
export const ABC_CLASSES = ["A", "B", "C"] as const;
export type AbcClass = (typeof ABC_CLASSES)[number];

/**
 * Where A and B end, as percentages of all value: a SKU is A while the value ranked before it is under
 * 80%, B while it is under 95%, and C after.
 */
export const ABC_LIMITS = { A: 80, B: 95 } as const satisfies Record<Exclude<AbcClass, "C">, number>;

/** One SKU's orders, units and gross value, its rank by value and its ABC class. */
export interface SkuValue {
  sku: string;
  /** The SKU's product category, from its first order. */
  category: string;
  orders: number;
  units: number;
  /** order_value_usd summed as given, before promo discounts (docs/data.md trap 6). */
  grossValue: number;
  /** 1 for the SKU with the most value. */
  rank: number;
  /** The value of the SKUs ranked before it, as a share of all value: 0 for the first. */
  shareBefore: number;
  /** The same share with its own value added: 1 for the last. */
  cumulativeShare: number;
  abcClass: AbcClass;
}

/** Orders grouped by a key, the groups in order of their first order. */
export function ordersBy(orders: readonly Order[], keyOf: (order: Order) => string): Map<string, Order[]> {
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const key = keyOf(order);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [order]);
    else group.push(order);
  }
  return groups;
}

/** A value in whole cents, so sums in floating point compare and add up exactly (ticket 33). */
export function cents(value: number): number {
  return Math.round(value * 100);
}

function abcClassOf(centsBefore: number, totalCents: number): AbcClass {
  // In whole cents and percentages, both sides are exact: 80% of 100.00 is 80.00, never 79.999….
  if (centsBefore * 100 < ABC_LIMITS.A * totalCents) return "A";
  if (centsBefore * 100 < ABC_LIMITS.B * totalCents) return "B";
  return "C";
}

/**
 * The ABC classification (ticket 33): SKUs by gross value, highest first, ties by SKU ascending, each
 * with its class. Values compare and add up to the cent, so the order orders were summed in never breaks
 * a tie or moves a SKU across a limit.
 */
export function abcClasses(orders: readonly Order[]): SkuValue[] {
  const skus = [...ordersBy(orders, (order) => order.sku)].map(([sku, skuOrders]) => ({
    sku,
    category: skuOrders[0]?.product_category ?? "",
    orders: skuOrders.length,
    units: units(skuOrders),
    grossValue: grossOrderValue(skuOrders),
  }));
  skus.sort((a, b) => cents(b.grossValue) - cents(a.grossValue) || a.sku.localeCompare(b.sku, "en"));
  const totalCents = skus.reduce((sum, { grossValue }) => sum + cents(grossValue), 0);
  let centsBefore = 0;
  return skus.map((sku, index) => {
    const before = centsBefore;
    centsBefore += cents(sku.grossValue);
    return {
      ...sku,
      rank: index + 1,
      shareBefore: totalCents === 0 ? 0 : before / totalCents,
      cumulativeShare: totalCents === 0 ? 0 : centsBefore / totalCents,
      abcClass: abcClassOf(before, totalCents),
    };
  });
}

/**
 * What a group of orders adds up to (ticket 33): a row of the warehouse scorecard, a lane, a client or a
 * category. Counts and sums are over every order; the rates and the average are over its delivered
 * orders, as the KPI cards define them (ADR 0001), with the small-sample flag of §6.
 */
export interface GroupFigures {
  orders: number;
  units: number;
  /** order_value_usd as given, before promo discounts (docs/data.md trap 6). */
  grossValue: number;
  /** Delivered orders: the n of the rates and the average. */
  delivered: number;
  onTimeRate: Ratio;
  delayRate: Ratio;
  averageDeliveryDays: Ratio;
  /** Fewer than 20 delivered orders (ADR 0001 §6). */
  smallSample: boolean;
}

export function groupFigures(orders: readonly Order[]): GroupFigures {
  const delivered = deliveredOrders(orders).length;
  return {
    orders: orders.length,
    units: units(orders),
    grossValue: grossOrderValue(orders),
    delivered,
    onTimeRate: onTimeRate(orders),
    delayRate: delayRate(orders),
    averageDeliveryDays: averageDeliveryDays(orders),
    smallSample: delivered < SMALL_SAMPLE_MIN_DELIVERED,
  };
}

/** A group's gross value as a share of the gross value of `all` (ticket 33). */
export function shareOfValue(group: readonly Order[], all: readonly Order[]): Ratio {
  return ratio(grossOrderValue(group), grossOrderValue(all));
}
