import type { Order } from "./orders";

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

const MS_PER_DAY = 86_400_000;

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

/**
 * delivery_date − order_date in whole days. Date-only ISO strings parse as UTC midnight,
 * so no local clock change can shift the result.
 */
export function deliveryDays(order: DeliveredOrder): number {
  return Math.round((Date.parse(order.delivery_date) - Date.parse(order.order_date)) / MS_PER_DAY);
}

export function onTimeRate(orders: readonly Order[]): Ratio {
  return ratio(deliveryOutcomes(orders).onTime, deliveredOrders(orders).length);
}

export function averageDeliveryDays(orders: readonly Order[]): Ratio {
  const delivered = deliveredOrders(orders);
  const totalDays = delivered.reduce((sum, order) => sum + deliveryDays(order), 0);
  return ratio(totalDays, delivered.length);
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
