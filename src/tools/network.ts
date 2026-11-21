import { cents, type GroupFigures, groupFigures, type MetricId, ordersBy } from "@/domain/definitions";
import type { Order } from "@/domain/orders";
import type { SortDirection } from "./orders-view";

/**
 * Network (ticket 33): the warehouses as a scorecard, the lanes from origin to destination, and the
 * clients, the way a 3PL reports per customer. The figures are domain/definitions' groupFigures; this
 * only groups, sorts and marks. Pure: no clock, no network.
 */

export interface WarehouseRow {
  warehouse: string;
  figures: GroupFigures;
}

/** The scorecard's columns, in its order, named as the metrics they show; each can sort it. */
export const SCORECARD_COLUMNS = [
  "warehouse",
  "order_count",
  "units",
  "gross_order_value",
  "delivered_orders",
  "on_time_rate",
  "delay_rate",
  "average_delivery_time",
] as const satisfies readonly ("warehouse" | MetricId)[];
export type ScorecardColumn = (typeof SCORECARD_COLUMNS)[number];
export interface ScorecardSort {
  column: ScorecardColumn;
  direction: SortDirection;
}

/** The scorecard's order when none is asked for: the highest on-time rate first. */
export const DEFAULT_SCORECARD_SORT: ScorecardSort = { column: "on_time_rate", direction: "desc" };

export interface Scorecard {
  rows: WarehouseRow[];
  /** Every order of every warehouse. */
  total: GroupFigures;
  /**
   * The warehouses with the highest and the lowest on-time rate among those with at least 20 delivered
   * orders (ADR 0001 §6), all of them when tied. None when fewer than two qualify or all score the same.
   */
  best: string[];
  worst: string[];
}

/** A row's value in a column, for sorting; null for a rate with nothing delivered. */
function columnValue({ warehouse, figures }: WarehouseRow, column: ScorecardColumn): string | number | null {
  switch (column) {
    case "warehouse":
      return warehouse;
    case "order_count":
      return figures.orders;
    case "units":
      return figures.units;
    case "gross_order_value":
      // To the cent, so floating point never breaks a tie.
      return cents(figures.grossValue);
    case "delivered_orders":
      return figures.delivered;
    case "on_time_rate":
      return figures.onTimeRate.value;
    case "delay_rate":
      return figures.delayRate.value;
    case "average_delivery_time":
      return figures.averageDeliveryDays.value;
  }
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

/** Rows in a column's order either way, rows with no value last whichever way, ties by warehouse. */
function sortRows(rows: readonly WarehouseRow[], { column, direction }: ScorecardSort): WarehouseRow[] {
  return [...rows].sort((a, b) => {
    const [x, y] = [columnValue(a, column), columnValue(b, column)];
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      const ascending = typeof x === "number" && typeof y === "number" ? x - y : byName(String(x), String(y));
      if (ascending !== 0) return direction === "asc" ? ascending : -ascending;
    }
    return byName(a.warehouse, b.warehouse);
  });
}

/** The warehouses at the highest and the lowest on-time rate, among those with enough deliveries to rank. */
function extremes(rows: readonly WarehouseRow[]): Pick<Scorecard, "best" | "worst"> {
  const ranked = rows.flatMap(({ warehouse, figures }) =>
    figures.smallSample || figures.onTimeRate.value === null ? [] : [{ warehouse, rate: figures.onTimeRate.value }],
  );
  const rates = ranked.map(({ rate }) => rate);
  const [highest, lowest] = [Math.max(...rates), Math.min(...rates)];
  if (ranked.length < 2 || highest === lowest) return { best: [], worst: [] };
  const at = (rate: number) =>
    ranked
      .filter((row) => row.rate === rate)
      .map(({ warehouse }) => warehouse)
      .sort(byName);
  return { best: at(highest), worst: at(lowest) };
}

/** The warehouse scorecard: one row per warehouse, in the order asked for, highest on-time rate first by default. */
export function warehouseScorecard(orders: readonly Order[], sort: ScorecardSort = DEFAULT_SCORECARD_SORT): Scorecard {
  const rows = [...ordersBy(orders, (order) => order.warehouse)].map(([warehouse, warehouseOrders]) => ({ warehouse, figures: groupFigures(warehouseOrders) }));
  return { rows: sortRows(rows, sort), total: groupFigures(orders), ...extremes(rows) };
}

export interface LaneRow {
  origin: string;
  destination: string;
  figures: GroupFigures;
}

export interface Lanes {
  /** Most orders first, ties by origin, then destination. */
  rows: LaneRow[];
  /** How many of them have fewer than 20 delivered orders (ADR 0001 §6). */
  smallSamples: number;
}

/** The lanes, origin to destination, and how many are small samples. */
export function lanes(orders: readonly Order[]): Lanes {
  const rows = laneRows(orders);
  return { rows, smallSamples: rows.filter(({ figures }) => figures.smallSample).length };
}

function laneRows(orders: readonly Order[]): LaneRow[] {
  return [...ordersBy(orders, (order) => order.origin_city)]
    .flatMap(([origin, fromOrigin]) =>
      [...ordersBy(fromOrigin, (order) => order.destination_city)].map(([destination, laneOrders]) => ({ origin, destination, figures: groupFigures(laneOrders) })),
    )
    .sort((a, b) => b.figures.orders - a.figures.orders || byName(a.origin, b.origin) || byName(a.destination, b.destination));
}

export interface ClientRow {
  client: string;
  figures: GroupFigures;
}

/** The clients: the most gross value first, to the cent, ties by client. */
export function clientRows(orders: readonly Order[]): ClientRow[] {
  return [...ordersBy(orders, (order) => order.client_id)]
    .map(([client, clientOrders]) => ({ client, figures: groupFigures(clientOrders) }))
    .sort((a, b) => cents(b.figures.grossValue) - cents(a.figures.grossValue) || byName(a.client, b.client));
}
