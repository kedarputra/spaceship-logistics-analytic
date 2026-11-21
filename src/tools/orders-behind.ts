import { METRIC_STATUSES } from "@/domain/definitions";
import type { Order } from "@/domain/orders";
import { isMonthEnd, type Period } from "@/domain/periods";
import { type OrdersView, ordersInView } from "./orders-view";
import type { QueryResult } from "./query";

/**
 * The orders behind a query answer, as a Raw data view (ticket 29): the spec's filters, the statuses
 * of the orders the metric is computed over (domain/definitions' METRIC_STATUSES: for a rate or an
 * average, the delivered orders it divides by), and the period as months on the answer's date field.
 * The count is the view's, picked by the same code as the Raw data page, so the link's number is the
 * number of rows it opens.
 */

export interface OrdersBehind {
  view: OrdersView;
  count: number;
}

type Status = Order["status"];

/** The statuses both the spec's filter and the metric allow; undefined when neither narrows them. */
function statusesOf(filter: readonly Status[] | undefined, metric: readonly Status[] | undefined): Status[] | undefined {
  if (filter === undefined) return metric === undefined ? undefined : [...metric];
  return metric === undefined ? [...filter] : filter.filter((status) => metric.includes(status));
}

/** Whether a period starts on a month's first day and ends on a month's last, or runs past the data at either end. */
function isWholeMonths(period: Period, coverage: Period): boolean {
  const starts = period.from <= coverage.from || period.from.endsWith("-01");
  const ends = period.to >= coverage.to || isMonthEnd(period.to);
  return starts && ends;
}

/** The period's months, clipped to the data's. */
function monthRange(period: Period, coverage: Period): { from: string; to: string } {
  const [from, to] = [period.from.slice(0, 7), period.to.slice(0, 7)];
  const [first, last] = [coverage.from.slice(0, 7), coverage.to.slice(0, 7)];
  return { from: from < first ? first : from, to: to > last ? last : to };
}

/**
 * The view of the orders behind an answer, and how many there are. Every spec filter is a Raw data filter
 * (origin, destination, client and SKU too since ticket 33). Undefined when a part of the spec has none (a
 * limit or a minimum of deliveries, which leave groups out; a period that is not whole months), or when no
 * order is behind it.
 */
export function ordersBehind(result: QueryResult, orders: readonly Order[]): OrdersBehind | undefined {
  const { spec, period, coverage } = result;
  if (spec.limit !== undefined || spec.minDelivered !== undefined) return undefined;
  const { status, ...lists } = spec.filters ?? {};
  if (!isWholeMonths(period, coverage)) return undefined;
  const statuses = statusesOf(status, METRIC_STATUSES[spec.metric]);
  if (statuses?.length === 0) return undefined;

  // Without a period every date is in: the view has no range, but keeps the date field for one picked later.
  const basis = result.dateField === "order_date" ? "order" : "delivery";
  const asked = spec.period !== undefined && spec.period.type !== "all";
  const view: OrdersView = {
    filters: statuses === undefined ? lists : { ...lists, status: statuses },
    dates: asked ? { basis, range: monthRange(period, coverage) } : { basis },
    search: "",
    page: 1,
  };
  const count = ordersInView(orders, view).length;
  return count === 0 ? undefined : { view, count };
}
