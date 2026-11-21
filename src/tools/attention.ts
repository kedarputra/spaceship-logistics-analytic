import { longestCompletedDelivery, overdueInTransit, type TransitAgeBucket, transitAge, transitAgeBuckets } from "@/domain/definitions";
import type { Dataset, Order } from "@/domain/orders";
import { deliveryDaysOf } from "./orders-view";

/**
 * Needs attention (ticket 32): the orders someone should act on, the way a WMS exception queue lists
 * them. Overdue in transit, then exceptions, delayed and canceled orders, each oldest first. The
 * definitions are domain/definitions'; this only picks, sorts and counts. Pure: no clock, no network.
 */

export type AttentionSectionId = "overdue" | "exceptions" | "delayed" | "canceled";

export interface AttentionRow {
  order: Order;
  /** Its transit age, for an order in transit; null for any other. */
  transitAge: number | null;
  /** Its delivery time, for a delivered order; null for any other. */
  deliveryDays: number | null;
}

export interface CarrierCount {
  carrier: string;
  count: number;
}

export interface AttentionSection {
  id: AttentionSectionId;
  /** The status of its orders: what Raw data filters on to open them. */
  status: Order["status"];
  /** Its orders, oldest first: by order date, ties in file order, as Raw data sorts by order date. */
  rows: AttentionRow[];
  /** How many of them each carrier has, most first, ties by name. */
  byCarrier: CarrierCount[];
  /**
   * How many orders its link opens in Raw data, where its status sorted by order date holds them. For
   * the overdue section that is every order in transit, as Raw data has no age filter. 0 when the
   * section is empty, so it links nowhere (ADR 0011 §5).
   */
  linkedOrderCount: number;
}

export interface Worklist {
  /** The overdue threshold: the longest completed delivery, in days; null when nothing was delivered. */
  longestCompletedDelivery: number | null;
  /** Every order in transit, overdue or not. */
  inTransit: number;
  /** The orders in transit by transit age: 0–7, 8–14, 15–30 and 31+ days. */
  buckets: TransitAgeBucket[];
  /** The orders in transit that are not overdue, oldest first. */
  withinThreshold: AttentionRow[];
  /** Overdue in transit, exceptions, delayed, canceled. */
  sections: AttentionSection[];
}

function rowOf(order: Order, anchor: string): AttentionRow {
  return { order, transitAge: transitAge(order, anchor), deliveryDays: deliveryDaysOf(order) };
}

/** Oldest first, by order date. Array.prototype.sort is stable, so ties keep file order. */
function oldestFirst(orders: readonly Order[], anchor: string): AttentionRow[] {
  return [...orders].sort((a, b) => a.order_date.localeCompare(b.order_date)).map((order) => rowOf(order, anchor));
}

function perCarrier(orders: readonly Order[]): CarrierCount[] {
  const counts = new Map<string, number>();
  for (const { carrier } of orders) counts.set(carrier, (counts.get(carrier) ?? 0) + 1);
  return [...counts]
    .map(([carrier, count]) => ({ carrier, count }))
    .sort((a, b) => b.count - a.count || a.carrier.localeCompare(b.carrier, "en"));
}

/** A section of `orders`, whose link opens the `statusCount` orders of its status in Raw data. */
function sectionOf(id: AttentionSectionId, status: Order["status"], orders: readonly Order[], statusCount: number, anchor: string): AttentionSection {
  return { id, status, rows: oldestFirst(orders, anchor), byCarrier: perCarrier(orders), linkedOrderCount: orders.length === 0 ? 0 : statusCount };
}

/**
 * The worklist over a dataset: its four sections, oldest first, and for the overdue one the threshold,
 * the orders in transit by age, and those still within the threshold.
 */
export function needsAttention({ orders, anchor }: Dataset): Worklist {
  const withStatus = (status: Order["status"]) => orders.filter((order) => order.status === status);
  const inTransit = withStatus("in_transit");
  const overdue = overdueInTransit(orders, anchor);
  const section = (id: AttentionSectionId, status: Order["status"]) => {
    const all = withStatus(status);
    return sectionOf(id, status, all, all.length, anchor);
  };
  return {
    longestCompletedDelivery: longestCompletedDelivery(orders),
    inTransit: inTransit.length,
    buckets: transitAgeBuckets(orders, anchor),
    withinThreshold: oldestFirst(
      inTransit.filter((order) => !overdue.includes(order)),
      anchor,
    ),
    sections: [
      sectionOf("overdue", "in_transit", overdue, inTransit.length, anchor),
      section("exceptions", "exception"),
      section("delayed", "delayed"),
      section("canceled", "canceled"),
    ],
  };
}
