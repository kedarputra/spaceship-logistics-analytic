import type { Dataset, Order } from "@/domain/orders";
import { buckets, dataPeriod, formatMonths } from "@/domain/periods";
import { LIST_FILTERS, type ListFilter, MENU_FILTERS, type MenuFilter } from "@/tools/list-filters";
import { type DateBasis, type OrdersView, VIEW_COLUMNS, type ViewColumn } from "@/tools/orders-view";
import { DIMENSION_VALUES, filtersSchema, validatingAgainst, valuesInData } from "@/tools/spec";
import { valueLabel } from "@/tools/words";
import type { FilterList, Option } from "./data-filters";
import { DATA_PAGE_PATH, hrefOf, ordersHref, viewParams } from "./orders-href";

/**
 * The Raw data page's URL (ticket 28): the view it asks for, read with the query spec's own schema
 * (ADR 0006), and the links to other views: sort, chips, Clear all, the CSV. A view is written as a
 * URL by orders-href; the orders it shows are tools/orders-view's to pick.
 */

const CSV_PATH = "/api/orders.csv";

const LIST_LABELS: Record<ListFilter, string> = {
  status: "Status",
  carrier: "Carrier",
  region: "Region",
  warehouse: "Warehouse",
  origin: "Origin",
  destination: "Destination",
  category: "Category",
  client: "Client",
  sku: "SKU",
};

/** The parameters that take one value; a second one is not read. */
const SINGLE_VALUED = ["date", "from", "to", "q", "sort", "dir", "page"] as const;
type SingleValued = Partial<Record<(typeof SINGLE_VALUED)[number], string>>;

const SEARCH_MAX_LENGTH = 100;

/** A parameter the page did not apply, and why. */
export interface IgnoredParameter {
  parameter: string;
  reason: string;
}

export type SearchParams = Record<string, string | string[] | undefined>;

/** The months the data covers, as the date range offers them: "2025-01", "Jan 2025". */
export function dataMonths(orders: readonly Order[]): Option[] {
  return buckets(dataPeriod(orders), "month").map((bucket) => ({ value: bucket.key.slice(0, 7), label: bucket.label }));
}

function isListFilter(name: string): name is ListFilter {
  return LIST_FILTERS.some((filter) => filter === name);
}

function isSingleValued(name: string): name is (typeof SINGLE_VALUED)[number] {
  return SINGLE_VALUED.some((parameter) => parameter === name);
}

function isViewColumn(name: string): name is ViewColumn {
  return VIEW_COLUMNS.some((column) => column === name);
}

/** One value of a spec filter as the query spec reads it ("fedex" → "FedEx"), or why it is not one. */
function specValue(filter: ListFilter | "promo", value: string): { value: string } | { reason: string } {
  const parsed = filtersSchema.safeParse({ [filter]: [value] });
  const read = parsed.success ? parsed.data[filter]?.[0] : undefined;
  if (read !== undefined) return { value: read };
  return { reason: parsed.error?.issues[0]?.message ?? `Not a ${filter}` };
}

/** A URL's query as the page reads it: each name with all its values. */
export function paramsRecord(params: URLSearchParams): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const [name, value] of params) record[name] = [...(record[name] ?? []), value];
  return record;
}

/**
 * The view a URL asks for (`/data?status=delayed&carrier=FedEx`), with each parameter or value it
 * cannot apply set aside with its reason. Destinations, clients and SKUs must be in `dataset`, and a
 * date range in its months: the session's active dataset (ticket 35).
 */
export function readOrdersView(params: SearchParams, dataset: Dataset): { view: OrdersView; ignored: IgnoredParameter[] } {
  return validatingAgainst(dataset, () => readView(params, dataset.orders));
}

function readView(params: SearchParams, orders: readonly Order[]): { view: OrdersView; ignored: IgnoredParameter[] } {
  const months = dataMonths(orders).map(({ value }) => value);
  const ignored: IgnoredParameter[] = [];
  const lists: Partial<Record<ListFilter, string[]>> = {};
  const promos = new Set<string>();
  const singleValued: SingleValued = {};

  for (const [name, raw] of Object.entries(params)) {
    // An empty field from a form sent without script means "any".
    const values = (Array.isArray(raw) ? raw : [raw ?? ""]).filter((value) => value.trim() !== "");
    if (values.length === 0) continue;
    if (isListFilter(name) || name === "promo") {
      for (const value of values) {
        const read = specValue(name, value);
        if ("reason" in read) ignored.push({ parameter: `${name}=${value}`, reason: read.reason });
        else if (name === "promo") promos.add(read.value);
        else lists[name] = [...new Set([...(lists[name] ?? []), read.value])];
      }
    } else if (isSingleValued(name)) {
      singleValued[name] = values[0];
    } else {
      ignored.push({ parameter: name, reason: "not a filter on this page" });
    }
  }

  // Every value passed the schema one by one; together they pass it again, which types them. Yes and no together is every order.
  const filters = filtersSchema.safeParse({ ...lists, ...(promos.size === 1 ? { promo: [...promos] } : {}) });
  if (!filters.success) throw new Error(`The filters read from the URL fail their schema: ${filters.error.message}`);

  return {
    view: {
      filters: filters.data,
      dates: readDates(singleValued, months, ignored),
      search: (singleValued.q ?? "").trim().slice(0, SEARCH_MAX_LENGTH),
      sort: readSort(singleValued, ignored),
      page: readPage(singleValued.page, ignored),
    },
    ignored,
  };
}

function readDates({ date, from: fromParam, to: toParam }: SingleValued, months: readonly string[], ignored: IgnoredParameter[]): OrdersView["dates"] {
  let basis: DateBasis = "order";
  if (date === "order" || date === "delivery") basis = date;
  else if (date !== undefined) ignored.push({ parameter: `date=${date}`, reason: "the date is order or delivery" });

  const [first, last] = [months[0], months.at(-1)];
  const covered = first === undefined || last === undefined ? "" : `the data covers ${formatMonths(`${first}-01`, `${last}-01`)}`;
  const month = (name: "from" | "to", value: string | undefined) => {
    if (value === undefined || months.includes(value)) return value;
    ignored.push({ parameter: `${name}=${value}`, reason: `not a month of the data: ${covered}` });
    return undefined;
  };
  const [from, to] = [month("from", fromParam), month("to", toParam)];
  if (from === undefined && to === undefined) return { basis };
  // One end alone runs to the other end of the data.
  const range = { from: from ?? first ?? "", to: to ?? last ?? "" };
  if (range.from > range.to) {
    const reason = `${range.from} is after ${range.to}`;
    ignored.push({ parameter: `from=${range.from}`, reason }, { parameter: `to=${range.to}`, reason });
    return { basis };
  }
  return { basis, range };
}

function readSort({ sort, dir }: SingleValued, ignored: IgnoredParameter[]): OrdersView["sort"] {
  if (dir !== undefined && dir !== "asc" && dir !== "desc") ignored.push({ parameter: `dir=${dir}`, reason: "the direction is asc or desc" });
  if (sort === undefined) {
    if (dir === "asc" || dir === "desc") ignored.push({ parameter: `dir=${dir}`, reason: "there is no sort column" });
    return undefined;
  }
  if (!isViewColumn(sort)) {
    ignored.push({ parameter: `sort=${sort}`, reason: "not a column" });
    return undefined;
  }
  return { column: sort, direction: dir === "desc" ? "desc" : "asc" };
}

function readPage(page: string | undefined, ignored: IgnoredParameter[]): number {
  if (page === undefined) return 1;
  if (/^[1-9]\d{0,5}$/.test(page)) return Number(page);
  ignored.push({ parameter: `page=${page}`, reason: "not a page number" });
  return 1;
}

/** A menu's values: the query spec's own, or for clients those in the dataset, as the spec checks them (tickets 33, 35). */
function menuValues(filter: MenuFilter, dataset: Dataset): readonly string[] {
  return filter === "client" ? valuesInData("client_id", dataset) : DIMENSION_VALUES[filter];
}

/** The lists the filter form offers as menus: the query spec's values, statuses in words. */
export function filterLists(dataset: Dataset): FilterList[] {
  return MENU_FILTERS.map((filter) => ({
    name: filter,
    label: LIST_LABELS[filter],
    options: menuValues(filter, dataset).map((value) => ({ value, label: valueLabel(filter, value) })),
  }));
}

/** The view's parameters without its page: what the filter form holds. */
export function filterQuery(view: OrdersView): string {
  return viewParams({ ...view, page: 1 }).toString();
}

/** The CSV of a view: every page of it, in its sort. */
export function csvHref(view: OrdersView): string {
  return hrefOf(CSV_PATH, viewParams({ ...view, page: 1 }));
}

/** A heading's link: sort by its column, or reverse the sort when it already is; back to page 1. */
export function sortHref(view: OrdersView, column: ViewColumn): string {
  const direction = view.sort?.column === column && view.sort.direction === "asc" ? "desc" : "asc";
  return ordersHref({ ...view, sort: { column, direction }, page: 1 });
}

/** The view with only the parameters `keep` accepts, back to page 1. */
function hrefKeeping(view: OrdersView, keep: (name: string, value: string) => boolean): string {
  return hrefOf(DATA_PAGE_PATH, new URLSearchParams([...viewParams({ ...view, page: 1 })].filter(([name, value]) => keep(name, value))));
}

/** Clear all: every filter gone, the sort kept. */
export function clearAllHref(view: OrdersView): string {
  return hrefKeeping(view, (name) => name === "sort" || name === "dir");
}

export interface FilterChip {
  label: string;
  /** The view without this filter. */
  href: string;
}

/** Each active filter in words, one chip per value, with the link that removes it. */
export function filterChips(view: OrdersView): FilterChip[] {
  const without = (dropped: (name: string, value: string) => boolean) => hrefKeeping(view, (name, value) => !dropped(name, value));
  const chips: FilterChip[] = [];
  if (view.search !== "") chips.push({ label: `Search: "${view.search}"`, href: without((name) => name === "q") });
  for (const filter of LIST_FILTERS) {
    for (const chosen of view.filters[filter] ?? []) {
      chips.push({
        label: `${LIST_LABELS[filter]}: ${valueLabel(filter, chosen)}`,
        href: without((name, value) => name === filter && value === chosen),
      });
    }
  }
  for (const promo of view.filters.promo ?? []) chips.push({ label: `Promo: ${promo === "yes" ? "Yes" : "No"}`, href: without((name) => name === "promo") });
  const { range, basis } = view.dates;
  if (range !== undefined) {
    chips.push({
      label: `${basis === "order" ? "Order date" : "Delivery date"}: ${formatMonths(`${range.from}-01`, `${range.to}-01`)}`,
      href: without((name) => name === "from" || name === "to"),
    });
  }
  return chips;
}
