import type { Order } from "./orders";
import { type Bucket, type BucketUnit, daysBetween, groupByBucket, isInPeriod, type Period } from "./periods";

/**
 * The one home of the KPI definitions (ADR 0001, Reading B). The dashboard and the query tool
 * both call these functions, so the same question always gets the same number.
 */

/** A delivered order: one with a delivery date (status delivered, delayed, or exception). */
export type DeliveredOrder = Order & { delivery_date: string };

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
  totalOrders: { count: number; inTransit: number; canceled: number };
  deliveredOrders: { count: number } & DeliveryOutcomes;
  delayedOrders: number;
  /** On-time deliveries ÷ delivered orders. */
  onTimeRate: Ratio;
  /** Total delivery days ÷ delivered orders. */
  averageDeliveryDays: Ratio;
}

/** Each KPI's name and its one-line definition, in the glossary's wording. */
export const KPI_DEFINITIONS = {
  totalOrders: {
    label: "Total orders",
    definition: "Every order in the data, including in-transit and canceled orders.",
  },
  deliveredOrders: {
    label: "Delivered orders",
    definition: "Orders with a delivery date: status delivered, delayed, or exception.",
  },
  delayedOrders: {
    label: "Delayed orders",
    definition: "Delivered orders with status delayed. Exception orders are not delayed orders.",
  },
  onTimeRate: {
    label: "On-time delivery rate",
    definition: "On-time deliveries divided by delivered orders.",
  },
  averageDeliveryDays: {
    label: "Average delivery time",
    definition: "Mean of delivery date − order date in days, over delivered orders.",
  },
} as const satisfies Record<keyof DashboardKpis, { label: string; definition: string }>;

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

/** A group with fewer delivered orders than this is a small sample (ADR 0001 §6). */
export const SMALL_SAMPLE_MIN_DELIVERED = 20;

/** Delayed orders ÷ delivered orders. Exception orders are in the denominator only. */
export function delayRate(orders: readonly Order[]): Ratio {
  return ratio(deliveryOutcomes(orders).delayed, deliveredOrders(orders).length);
}

export interface CarrierDelayRate {
  carrier: string;
  /** n is the denominator: the carrier's delivered orders. */
  rate: Ratio;
  smallSample: boolean;
}

/** Highest value first; a ratio with no value (zero denominator) last. */
function compareRatesDescending(a: Ratio, b: Ratio): number {
  if (a.value === b.value) return 0;
  if (a.value === null) return 1;
  if (b.value === null) return -1;
  return b.value - a.value;
}

/**
 * Every carrier's delay rate over the orders delivered in the period (dated by delivery_date,
 * ADR 0002 §5), highest first (ties by name), each flagged when it is a small sample. A carrier
 * with no delivery in the period stays in the list, last, with no rate.
 */
export function delayRateByCarrier(orders: readonly Order[], period: Period): CarrierDelayRate[] {
  const byCarrier = new Map<string, Order[]>();
  for (const order of orders) {
    byCarrier.set(order.carrier, [...(byCarrier.get(order.carrier) ?? []), order]);
  }
  return [...byCarrier]
    .map(([carrier, carrierOrders]) => {
      const rate = delayRate(carrierOrders.filter((order) => isInPeriod(order.delivery_date, period)));
      return { carrier, rate, smallSample: rate.denominator < SMALL_SAMPLE_MIN_DELIVERED };
    })
    .sort((a, b) => compareRatesDescending(a.rate, b.rate) || a.carrier.localeCompare(b.carrier, "en"));
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

/** The five KPI cards of R1. In-transit and canceled orders count only toward total orders. */
export function dashboardKpis(orders: readonly Order[]): DashboardKpis {
  const outcomes = deliveryOutcomes(orders);
  return {
    totalOrders: {
      count: orders.length,
      inTransit: orders.filter((order) => order.status === "in_transit").length,
      canceled: orders.filter((order) => order.status === "canceled").length,
    },
    deliveredOrders: { count: deliveredOrders(orders).length, ...outcomes },
    delayedOrders: outcomes.delayed,
    onTimeRate: onTimeRate(orders),
    averageDeliveryDays: averageDeliveryDays(orders),
  };
}
