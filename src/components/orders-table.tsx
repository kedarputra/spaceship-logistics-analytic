import Link from "next/link";
import type { ReactNode } from "react";
import { transitAge } from "@/domain/definitions";
import { formatCount, formatUsd } from "@/domain/format";
import type { Order } from "@/domain/orders";
import { formatDate } from "@/domain/periods";
import { deliveryDaysOf, type OrdersView, VIEW_COLUMNS, type ViewColumn } from "@/tools/orders-view";
import { STATUS_LABELS } from "@/tools/words";
import { sortHref } from "./orders-url";
import { ARIA_SORT, ARROW } from "./text-table";

interface Column {
  heading: string;
  /** Numbers: right-aligned. */
  numeric?: boolean;
  /** The value as the file has it, formatted only for reading; null for an empty cell. The anchor dates the transit age. */
  cell: (order: Order, anchor: string) => ReactNode;
}

const STATUS_STYLES: Record<Order["status"], { pill: string; dot: string }> = {
  delivered: { pill: "bg-ok-tint text-green-text", dot: "bg-mark-on-time" },
  delayed: { pill: "bg-warn-tint text-warn-ink", dot: "bg-mark-delayed" },
  exception: { pill: "bg-bad-tint text-bad-ink", dot: "bg-mark-exception" },
  in_transit: { pill: "bg-track text-ink-2", dot: "bg-mark-in-transit" },
  canceled: { pill: "bg-track text-ink-2", dot: "bg-mark-canceled" },
};

/** A status as a small pill: its outcome colour and its word, never the colour alone. */
function StatusPill({ status }: { status: Order["status"] }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`pill h-[22px] ${style.pill}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${style.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const COLUMNS: Record<ViewColumn, Column> = {
  order_id: { heading: "Order ID", cell: (order) => order.order_id },
  client_id: { heading: "Client", cell: (order) => order.client_id },
  order_date: { heading: "Order date", cell: (order) => formatDate(order.order_date) },
  delivery_date: { heading: "Delivery date", cell: (order) => (order.delivery_date === null ? null : formatDate(order.delivery_date)) },
  delivery_days: {
    heading: "Delivery days",
    numeric: true,
    cell: (order) => {
      const days = deliveryDaysOf(order);
      return days === null ? null : formatCount(days);
    },
  },
  age: {
    heading: "Days in transit",
    numeric: true,
    cell: (order, anchor) => {
      const age = transitAge(order, anchor);
      return age === null ? null : formatCount(age);
    },
  },
  carrier: { heading: "Carrier", cell: (order) => order.carrier },
  origin_city: { heading: "Origin", cell: (order) => order.origin_city },
  destination_city: { heading: "Destination", cell: (order) => order.destination_city },
  status: { heading: "Status", cell: (order) => <StatusPill status={order.status} /> },
  sku: { heading: "SKU", cell: (order) => order.sku },
  product_category: { heading: "Category", cell: (order) => order.product_category },
  quantity: { heading: "Quantity", numeric: true, cell: (order) => formatCount(order.quantity) },
  unit_price_usd: { heading: "Unit price", numeric: true, cell: (order) => formatUsd(order.unit_price_usd) },
  order_value_usd: { heading: "Order value", numeric: true, cell: (order) => formatUsd(order.order_value_usd) },
  is_promo: { heading: "Promo", cell: (order) => (order.is_promo ? "Yes" : "No") },
  promo_discount_pct: { heading: "Discount", numeric: true, cell: (order) => `${formatCount(order.promo_discount_pct)}%` },
  region: { heading: "Region", cell: (order) => order.region },
  warehouse: { heading: "Warehouse", cell: (order) => order.warehouse },
};

const CELL = "border-b border-grid px-3 py-2 whitespace-nowrap";
/** The Order ID column stays in view while the table scrolls sideways. */
const PINNED = "sticky left-0 border-r bg-panel";
/** The heading row stays in view while the rows scroll; its link fills the cell. */
const HEADING = "sticky top-0 border-b border-line bg-inset font-semibold whitespace-nowrap";


/**
 * The orders of one page of a Raw data view (ticket 28). It scrolls inside its card both ways: the
 * heading row stays in view as the rows scroll, the Order ID column as the table scrolls sideways.
 * Each heading sorts by its column, and a second click reverses it. `anchor` is the data's date, which
 * an order in transit is aged to (ticket 32).
 */
export function OrdersTable({ rows, view, anchor }: { rows: readonly Order[]; view: OrdersView; anchor: string }) {
  return (
    <div role="region" aria-label="Orders table, scrolls both ways" tabIndex={0} className="max-h-[min(70dvh,720px)] overflow-auto rounded-control border border-line">
      <table className="w-max min-w-full border-separate border-spacing-0 text-small">
        <thead>
          <tr>
            {VIEW_COLUMNS.map((key, index) => {
              const { heading, numeric } = COLUMNS[key];
              const direction = view.sort?.column === key ? view.sort.direction : undefined;
              return (
                <th
                  key={key}
                  scope="col"
                  aria-sort={direction === undefined ? undefined : ARIA_SORT[direction]}
                  className={`${HEADING} ${index === 0 ? "left-0 z-20 border-r" : "z-10"} ${numeric ? "text-right" : "text-left"}`}
                >
                  <Link
                    href={sortHref(view, key)}
                    scroll={false}
                    className={`flex items-center gap-1 px-3 py-2 text-muted no-underline hover:text-ink ${numeric ? "justify-end" : ""}`}
                  >
                    {heading}
                    {direction === undefined ? null : <span aria-hidden="true">{ARROW[direction]}</span>}
                  </Link>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => (
            <tr key={order.order_id}>
              {VIEW_COLUMNS.map((key, index) => {
                const { cell, numeric } = COLUMNS[key];
                if (index === 0) {
                  return (
                    <th key={key} scope="row" className={`${CELL} ${PINNED} z-[5] text-left font-medium`}>
                      {cell(order, anchor)}
                    </th>
                  );
                }
                const align = numeric ? "text-right" : "text-left";
                return (
                  <td key={key} className={`${CELL} ${align}`}>
                    {cell(order, anchor)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
