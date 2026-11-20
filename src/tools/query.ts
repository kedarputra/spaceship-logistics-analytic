import {
  type DateField,
  DELIVERY_OUTCOMES_DEFINITION,
  deliveredOrders,
  type DeliveryOutcomes,
  deliveryOutcomes,
  isRateOrAverage,
  type MetricDefinition,
  METRICS,
  type MetricId,
  ORDER_SHARE_DEFINITION,
  orderShare,
  SMALL_SAMPLE_MIN_DELIVERED,
} from "@/domain/definitions";
import type { Dataset, Order } from "@/domain/orders";
import {
  dataPeriod,
  formatPeriod,
  groupByBucket,
  isInPeriod,
  noDataMessage,
  type Period,
  resolvePeriod,
} from "@/domain/periods";
import { CATEGORY_DIMENSIONS, type GroupBy, isTimeDimension, type QueryFilters, type QuerySpec } from "./spec";
import { valueLabel } from "./words";

/**
 * The query tool: runs a validated spec over the data and returns the numbers with everything an
 * answer needs to explain them. Pure: no clock, no network, no LLM. Every metric comes from
 * domain/definitions, so an answer and the dashboard cannot disagree.
 */

export interface MetricInfo {
  id: QuerySpec["metric"];
  label: string;
  definition: string;
  kind: MetricDefinition["kind"];
  unit: MetricDefinition["unit"];
  /**
   * Whether ADR 0001 §6 applies: the metric divides by delivered orders, so a group with fewer than
   * 20 is a small sample and rankings follow the small-sample cases. Not for counts, nor for the
   * share of orders, whose n is all orders.
   */
  smallSampleRule: boolean;
}

/** Which way a ranking runs: its first row is the highest or the lowest. */
export type Direction = "highest" | "lowest";

function directionOf(sort: QuerySpec["sort"]): Direction {
  return sort === "asc" ? "lowest" : "highest";
}

export interface ResultRow {
  /** The group value, or the bucket's first day for time. */
  key: string;
  label: string;
  value: number | null;
  /** For rates and averages. */
  numerator?: number;
  denominator?: number;
  /**
   * For a rate or average: the delivered orders behind it (its denominator). For a count or sum:
   * the orders in the group after the filters and the period.
   */
  n: number;
  /** A rate or average on fewer than 20 delivered orders (ADR 0001 §6). Counts and sums are never flagged. */
  smallSample: boolean;
  /** For time buckets: the days inside the period, and whether the period cuts the unit short. */
  from?: string;
  to?: string;
  partial?: boolean;
  /** For the delivery-outcomes breakdown. */
  outcomes?: DeliveryOutcomes;
}

/** Which of the small-sample cases of ADR 0001 §6 a ranking falls into. */
export interface Ranking {
  case: "reliable" | "small-sample-top" | "no-reliable-group";
  top: ResultRow;
  /** The top group with at least 20 delivered orders, when the top group is a small sample. */
  topReliable?: ResultRow;
  minDelivered: number;
}

export interface StatusRewrite {
  from: string;
  to: string;
}

export interface QueryResult {
  kind: "result";
  /** The spec as validated, with filter values as they are in the data. */
  requestedSpec: QuerySpec;
  /** The spec that ran: the requested one after any status rewrite. */
  spec: QuerySpec;
  metric: MetricInfo;
  dateField: DateField;
  period: Period & { label: string };
  /** What the data covers: its first date to the anchor date. */
  coverage: Period & { label: string };
  rewrite?: StatusRewrite;
  rows: ResultRow[];
  /** For rows ordered by value: whether the first is the highest or the lowest. Absent in calendar order. */
  order?: Direction;
  /** Rows before the limit. */
  totalRows: number;
  /**
   * For a breakdown: the metric over the whole period and filters, from the definitions module,
   * so a total or an overall rate stays right however many rows a limit keeps.
   */
  overall?: RowValues;
  ranking?: Ranking;
  /** For counts: the orders counted, up to 50, and how many there are. */
  matchingOrders?: { total: number; orders: Order[] };
}

export interface NoDataResult {
  kind: "no-data";
  message: string;
}

/** A metric's values over a group of orders: a row without its key and label. */
export type RowValues = Omit<ResultRow, "key" | "label">;

/** A metric as the query tool runs it: the definition, and how to evaluate a group. */
interface QueryMetric {
  info: MetricInfo;
  evaluate: (orders: readonly Order[]) => RowValues;
  /** For counts: the orders counted. */
  matching?: (orders: readonly Order[]) => Order[];
}

/** The date a metric's period filters on, unless the spec overrides it (ADR 0002 §5). */
function defaultDateField(id: QuerySpec["metric"]): DateField {
  if (id === "delivery_outcomes") return DELIVERY_OUTCOMES_DEFINITION.dateField;
  if (id === "order_share") return ORDER_SHARE_DEFINITION.dateField;
  return METRICS[id].dateField;
}

/** `ordersInPeriod`: every order in the period, whatever the filters, for the share of orders. */
function queryMetric(id: QuerySpec["metric"], ordersInPeriod: number): QueryMetric {
  if (id === "delivery_outcomes") {
    const { label, definition } = DELIVERY_OUTCOMES_DEFINITION;
    return {
      info: { id, label, definition, kind: "count", unit: "orders", smallSampleRule: false },
      evaluate: (orders) => {
        const delivered = deliveredOrders(orders).length;
        return { value: delivered, n: delivered, smallSample: false, outcomes: deliveryOutcomes(orders) };
      },
      matching: deliveredOrders,
    };
  }
  if (id === "order_share") {
    const { label, definition } = ORDER_SHARE_DEFINITION;
    return {
      info: { id, label, definition, kind: "rate", unit: "percent", smallSampleRule: false },
      // n is all orders in the period: the small-sample rule counts delivered orders, so it does not apply.
      evaluate: (orders) => {
        const share = orderShare(orders.length, ordersInPeriod);
        return { value: share.value, numerator: share.numerator, denominator: share.denominator, n: share.denominator, smallSample: false };
      },
      matching: (orders) => [...orders],
    };
  }
  const definition = METRICS[id];
  const info: MetricInfo = {
    id,
    label: definition.label,
    definition: definition.definition,
    kind: definition.kind,
    unit: definition.unit,
    smallSampleRule: isRateOrAverage(definition.kind),
  };
  switch (definition.kind) {
    case "count":
      return {
        info,
        evaluate: (orders) => ({ value: definition.compute(orders), n: orders.length, smallSample: false }),
        matching: definition.matching,
      };
    case "sum":
      return {
        info,
        evaluate: (orders) => ({ value: definition.compute(orders), n: orders.length, smallSample: false }),
      };
    case "rate":
    case "average":
      return {
        info,
        evaluate: (orders) => {
          const { value, numerator, denominator } = definition.compute(orders);
          return { value, numerator, denominator, n: denominator, smallSample: denominator < SMALL_SAMPLE_MIN_DELIVERED };
        },
      };
  }
}

const MATCHING_ORDERS_SHOWN = 50;
const DELIVERED_STATUSES: readonly Order["status"][] = ["delivered", "delayed", "exception"];
const STATUS_REWRITES: { status: Order["status"]; metric: MetricId }[] = [
  { status: "delivered", metric: "on_time_deliveries" },
  { status: "delayed", metric: "delayed_orders" },
  { status: "exception", metric: "exception_orders" },
];

/**
 * ADR 0006 §2: an order count filtered by status becomes its canonical metric, so "orders with
 * status delayed" and "delayed orders" give the same number. The status filter stays, so a
 * breakdown by status still shows only the statuses asked for. A mix that stays an order count
 * is dated by delivery date when every status in it was delivered.
 */
function rewriteStatusFilter(spec: QuerySpec): { spec: QuerySpec; rewrite?: StatusRewrite; dateField?: DateField } {
  const statuses = spec.filters?.status;
  if (spec.metric !== "order_count" || statuses === undefined) return { spec };
  const distinct = [...new Set(statuses)];
  const single = distinct.length === 1 ? STATUS_REWRITES.find((rewrite) => rewrite.status === distinct[0]) : undefined;
  const allDelivered = distinct.every((status) => DELIVERED_STATUSES.includes(status));
  const metric = single?.metric ?? (allDelivered && distinct.length === DELIVERED_STATUSES.length ? "delivered_orders" : undefined);
  if (metric === undefined) return { spec, dateField: allDelivered ? "delivery_date" : "order_date" };
  return {
    spec: { ...spec, metric },
    rewrite: { from: `order count with status ${distinct.join(", ")}`, to: METRICS[metric].label.toLowerCase() },
  };
}

type FilterDimension = keyof QueryFilters;

/** The value of an order on a dimension, as filters and group-bys name it. */
function dimensionValue(order: Order, dimension: FilterDimension): string {
  switch (dimension) {
    case "carrier":
      return order.carrier;
    case "region":
      return order.region;
    case "warehouse":
      return order.warehouse;
    case "origin":
      return order.origin_city;
    case "destination":
      return order.destination_city;
    case "category":
      return order.product_category;
    case "status":
      return order.status;
    case "client":
      return order.client_id;
    case "sku":
      return order.sku;
    case "promo":
      return order.is_promo ? "yes" : "no";
  }
}

const FILTER_DIMENSIONS: readonly FilterDimension[] = [...CATEGORY_DIMENSIONS, "sku"];

function matchesFilters(order: Order, filters: QueryFilters): boolean {
  return FILTER_DIMENSIONS.every((dimension) => {
    const allowed: readonly string[] | undefined = filters[dimension];
    return allowed === undefined || allowed.includes(dimensionValue(order, dimension));
  });
}

interface Scope {
  /** Orders that match the filters, whatever their date: they decide which groups exist. */
  filtered: readonly Order[];
  /** Those of them inside the period on the date field: they decide the values. */
  inPeriod: readonly Order[];
  dateField: DateField;
  period: Period;
}

function groupRows(groupBy: GroupBy | undefined, metric: QueryMetric, scope: Scope): ResultRow[] {
  const { filtered, inPeriod, dateField, period } = scope;
  if (groupBy === undefined) return [{ key: "all", label: metric.info.label, ...metric.evaluate(inPeriod) }];
  if (isTimeDimension(groupBy)) {
    return groupByBucket(inPeriod, (order) => order[dateField], period, groupBy).map(({ bucket, items }) => ({
      key: bucket.key,
      label: bucket.label,
      from: bucket.from,
      to: bucket.to,
      partial: bucket.partial,
      ...metric.evaluate(items),
    }));
  }
  // Every group the filters allow gets a row (ADR 0001 §6), even one with nothing in the period.
  const groups = new Map<string, Order[]>(filtered.map((order) => [dimensionValue(order, groupBy), []]));
  for (const order of inPeriod) groups.get(dimensionValue(order, groupBy))?.push(order);
  return [...groups].map(([value, items]) => ({
    key: value,
    label: valueLabel(groupBy, value),
    ...metric.evaluate(items),
  }));
}

/** By value in the given direction, rows with no value last, ties by label. */
function sortRows(rows: readonly ResultRow[], direction: "asc" | "desc"): ResultRow[] {
  return [...rows].sort((a, b) => {
    if (a.value !== b.value) {
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return direction === "desc" ? b.value - a.value : a.value - b.value;
    }
    return a.label.localeCompare(b.label, "en");
  });
}

/** The first `limit` rows, and any further rows tied with the last of them: a limit never cuts a tie. */
function limitKeepingTies(rows: readonly ResultRow[], limit: number): ResultRow[] {
  const last = rows[limit - 1];
  if (last === undefined) return [...rows];
  let end = limit;
  while (end < rows.length && rows[end]?.value === last.value && last.value !== null) end += 1;
  return rows.slice(0, end);
}

/** Ties exist only in an order by value; in calendar order, equal neighbours are no tie. */
function applyLimit(rows: readonly ResultRow[], limit: number | undefined, byValue: boolean): ResultRow[] {
  if (limit === undefined) return [...rows];
  return byValue ? limitKeepingTies(rows, limit) : rows.slice(0, limit);
}

/** ADR 0001 §6: rank every group, flag small samples, and decide which case the answer is in. */
function rank(rows: readonly ResultRow[]): Ranking | undefined {
  const [top] = rows;
  if (top === undefined) return undefined;
  const minDelivered = SMALL_SAMPLE_MIN_DELIVERED;
  if (!top.smallSample) return { case: "reliable", top, minDelivered };
  const topReliable = rows.find((row) => !row.smallSample && row.value !== null);
  if (topReliable === undefined) return { case: "no-reliable-group", top, minDelivered };
  return { case: "small-sample-top", top, topReliable, minDelivered };
}

function listMatchingOrders(metric: QueryMetric, scope: Scope): QueryResult["matchingOrders"] {
  if (metric.matching === undefined) return undefined;
  const { dateField } = scope;
  const sorted = metric
    .matching(scope.inPeriod)
    .sort((a, b) => (a[dateField] ?? "").localeCompare(b[dateField] ?? "") || a.order_id.localeCompare(b.order_id));
  return { total: sorted.length, orders: sorted.slice(0, MATCHING_ORDERS_SHOWN) };
}

/** Runs a validated query spec over the dataset. */
export function runQuery(validSpec: QuerySpec, dataset: Dataset): QueryResult | NoDataResult {
  const { spec, rewrite, dateField: statusDateField } = rewriteStatusFilter(validSpec);
  const dateField = spec.dateField ?? statusDateField ?? defaultDateField(spec.metric);

  const coverage = dataPeriod(dataset.orders);
  const period = resolvePeriod(spec.period ?? { type: "all" }, coverage);
  const noData = noDataMessage(period, coverage);
  if (noData !== null) return { kind: "no-data", message: noData };

  const ordersInPeriod = dataset.orders.filter((order) => isInPeriod(order[dateField], period)).length;
  const metric = queryMetric(spec.metric, ordersInPeriod);
  const filtered = dataset.orders.filter((order) => matchesFilters(order, spec.filters ?? {}));
  const scope: Scope = {
    filtered,
    inPeriod: filtered.filter((order) => isInPeriod(order[dateField], period)),
    dateField,
    period,
  };
  const minDelivered = spec.minDelivered;
  const grouped = groupRows(spec.groupBy, metric, scope).filter((row) => minDelivered === undefined || row.n >= minDelivered);

  const isCategory = spec.groupBy !== undefined && !isTimeDimension(spec.groupBy);
  const byValue = isCategory || spec.sort !== undefined;
  const sorted = byValue ? sortRows(grouped, spec.sort ?? "desc") : grouped;
  const limited = applyLimit(sorted, spec.limit, byValue);

  return {
    kind: "result",
    requestedSpec: validSpec,
    spec,
    metric: metric.info,
    dateField,
    period: { ...period, label: formatPeriod(period) },
    coverage: { ...coverage, label: formatPeriod(coverage) },
    rewrite,
    order: byValue ? directionOf(spec.sort) : undefined,
    rows: limited,
    totalRows: sorted.length,
    overall: spec.groupBy === undefined ? undefined : metric.evaluate(scope.inPeriod),
    ranking: isCategory && metric.info.smallSampleRule ? rank(sorted) : undefined,
    matchingOrders: listMatchingOrders(metric, scope),
  };
}
