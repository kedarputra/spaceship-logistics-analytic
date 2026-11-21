import { deliveryDays, isDelivered, transitAge } from "@/domain/definitions";
import type { Order } from "@/domain/orders";
import { anchorDate, isInPeriod, monthsPeriod } from "@/domain/periods";
import type { ListFilter } from "./list-filters";
import { matchesFilters } from "./query";
import type { QueryFilters } from "./spec";

/**
 * The orders a Raw data view shows (ticket 28): the query spec's filters, matched by the query tool's
 * own code so a view and an answer count the same orders, then a month range, a search and a sort,
 * in pages of 50. Pure: no clock, no network. Reading a view from a URL is components/orders-url.
 */

export type DateBasis = "order" | "delivery";
export type SortDirection = "asc" | "desc";

/**
 * The columns the page shows, in its order: the file's, Order ID first, the days from order to delivery,
 * and the transit age of an order in transit (ticket 32). Each can sort the view.
 */
export const VIEW_COLUMNS = [
  "order_id",
  "client_id",
  "order_date",
  "delivery_date",
  "delivery_days",
  "age",
  "carrier",
  "origin_city",
  "destination_city",
  "status",
  "sku",
  "product_category",
  "quantity",
  "unit_price_usd",
  "order_value_usd",
  "is_promo",
  "promo_discount_pct",
  "region",
  "warehouse",
] as const satisfies readonly (keyof Order | "delivery_days" | "age")[];
export type ViewColumn = (typeof VIEW_COLUMNS)[number];

export interface OrdersView {
  /** Spec filters: the lists, and promo when it is yes or no. */
  filters: Pick<QueryFilters, ListFilter | "promo">;
  /** Which date a range filters on, and the range as months (YYYY-MM), both ends inside the data. */
  dates: { basis: DateBasis; range?: { from: string; to: string } };
  /** Text to find in the order ID, client, SKU or either city; "" for none. */
  search: string;
  /** Unsorted: file order. */
  sort?: { column: ViewColumn; direction: SortDirection };
  page: number;
}

export const ORDERS_PER_PAGE = 50;

/** Days from order to delivery (definitions' deliveryDays), or null for an order not delivered. */
export function deliveryDaysOf(order: Order): number | null {
  return isDelivered(order) ? deliveryDays(order) : null;
}

/** Whether a view leaves any order out: a filter, a date range or a search. Sorting and paging leave all in. */
export function isFiltered(view: OrdersView): boolean {
  return Object.values(view.filters).some((values) => values !== undefined) || view.dates.range !== undefined || view.search !== "";
}

/** The fields the search looks in. */
function searchedText(order: Order): string[] {
  return [order.order_id, order.client_id, order.sku, order.origin_city, order.destination_city];
}

/** An order's value in a column, for sorting; null when it has none. The anchor dates the transit age. */
function sortValue(order: Order, column: ViewColumn, anchor: string): string | number | null {
  if (column === "delivery_days") return deliveryDaysOf(order);
  if (column === "age") return transitAge(order, anchor);
  if (column === "is_promo") return order.is_promo ? 1 : 0;
  return order[column];
}

function compareValues(a: string | number | null, b: string | number | null, direction: SortDirection): number {
  // Empty values go last whichever way the column runs.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const ascending = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en");
  return direction === "asc" ? ascending : -ascending;
}

/**
 * The orders a view shows, in its order: the filters, the date range and the search, then the sort (file
 * order when unsorted). `orders` is every order of the data, so their anchor date (ADR 0002) dates the
 * transit age.
 */
export function ordersInView(orders: readonly Order[], view: OrdersView): Order[] {
  const { range, basis } = view.dates;
  const period = range === undefined ? undefined : monthsPeriod(range.from, range.to);
  const dateField = basis === "order" ? "order_date" : "delivery_date";
  const needle = view.search.toLowerCase();
  const selected = orders.filter(
    (order) =>
      matchesFilters(order, view.filters) &&
      (period === undefined || isInPeriod(order[dateField], period)) &&
      (needle === "" || searchedText(order).some((text) => text.toLowerCase().includes(needle))),
  );
  const { sort } = view;
  // No rows, nothing to sort; and no orders at all would have no anchor date.
  if (sort === undefined || selected.length === 0) return selected;
  const anchor = anchorDate(orders);
  // Array.prototype.sort is stable, so ties keep file order.
  return selected.sort((a, b) => compareValues(sortValue(a, sort.column, anchor), sortValue(b, sort.column, anchor), sort.direction));
}

export interface OrdersPage {
  rows: Order[];
  /** The page shown: the one asked for, or the last when it asked past the end. */
  page: number;
  pages: number;
  /** The rows' positions in the view, from 1: "51–100 of 400". */
  first: number;
  last: number;
  total: number;
}

export function pageOf(orders: readonly Order[], page: number): OrdersPage {
  const pages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * ORDERS_PER_PAGE;
  const rows = orders.slice(start, start + ORDERS_PER_PAGE);
  return { rows, page: current, pages, first: rows.length === 0 ? 0 : start + 1, last: start + rows.length, total: orders.length };
}
