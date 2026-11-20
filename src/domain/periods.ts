import type { Order } from "./orders";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The anchor date (ADR 0002): the latest order_date or delivery_date in the data.
 * Relative periods count back from it, and the UI shows it as "Data as of".
 * Dates are YYYY-MM-DD strings, so comparing them as strings compares them as dates.
 */
export function anchorDate(orders: readonly Pick<Order, "order_date" | "delivery_date">[]): string {
  let latest: string | undefined;
  for (const order of orders) {
    for (const date of [order.order_date, order.delivery_date]) {
      if (date !== null && (latest === undefined || date > latest)) latest = date;
    }
  }
  if (latest === undefined) throw new Error("The dataset has no orders, so it has no anchor date");
  return latest;
}

/** "2025-12-31" → "31 Dec 2025". Works on the string, so no time zone can shift the day. */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) throw new Error(`Not a YYYY-MM-DD date: "${date}"`);
  return `${Number(match[3])} ${month} ${match[1]}`;
}
