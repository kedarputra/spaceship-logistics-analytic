import type { Order } from "@/domain/orders";
import { LIST_FILTERS, type ListFilter } from "@/tools/list-filters";
import type { DateBasis, OrdersView } from "@/tools/orders-view";

/**
 * Links to the Raw data page (ticket 28): a view written as its URL. No imports that load the data,
 * so an answer on the Ask page can link to its orders from the browser (ticket 29). Reading a URL
 * back into a view is orders-url's.
 */

export const DATA_PAGE_PATH = "/data";

/** A view's filters as its URL writes them: statuses as the data names them, the other values as text. */
export type FilterValues = { status?: readonly Order["status"][] } & Partial<Record<Exclude<ListFilter, "status"> | "promo", readonly string[]>>;

/** A view as its URL writes it. A view read from a URL is one. */
export type ViewParams = Omit<OrdersView, "filters"> & { filters: FilterValues };

/**
 * A view as URL parameters, in the form's order: search, the lists, promo, dates, sort, page. Defaults
 * are left out (order date, ascending, page 1), so the plain page is just /data.
 */
export function viewParams(view: ViewParams): URLSearchParams {
  const params = new URLSearchParams();
  if (view.search !== "") params.set("q", view.search);
  for (const filter of LIST_FILTERS) for (const value of view.filters[filter] ?? []) params.append(filter, value);
  for (const value of view.filters.promo ?? []) params.append("promo", value);
  if (view.dates.basis === "delivery") params.set("date", "delivery");
  if (view.dates.range !== undefined) {
    params.set("from", view.dates.range.from);
    params.set("to", view.dates.range.to);
  }
  if (view.sort !== undefined) {
    params.set("sort", view.sort.column);
    if (view.sort.direction === "desc") params.set("dir", "desc");
  }
  if (view.page > 1) params.set("page", String(view.page));
  return params;
}

export function hrefOf(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? path : `${path}?${query}`;
}

/** The page's link to a view. */
export function ordersHref(view: ViewParams): string {
  return hrefOf(DATA_PAGE_PATH, viewParams(view));
}

/** The orders these filters pick, in a sort or in file order: what a card, a bar or a table row opens. */
export function filteredOrdersHref(filters: FilterValues, sort?: OrdersView["sort"]): string {
  return ordersHref({ filters, dates: { basis: "order" }, search: "", sort, page: 1 });
}

/** The orders of one month by order or delivery date that the filters pick: what a month of a chart opens (ticket 26). */
export function monthOrdersHref(monthStart: string, basis: DateBasis, filters: FilterValues = {}): string {
  // A month's first day (YYYY-MM-DD, a bucket's key) as the view's YYYY-MM.
  const key = monthStart.slice(0, 7);
  return ordersHref({ filters, dates: { basis, range: { from: key, to: key } }, search: "", page: 1 });
}
