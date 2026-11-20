import type { DateField } from "@/domain/definitions";
import type { GroupBy, QueryFilters, QuerySpec } from "./spec";

/**
 * How specs are put into words, shared by the interpretation (tools/answer) and the explanation
 * panel. Type-only imports keep it free of the data loader, so the browser can use it too.
 */

type FilterDimension = keyof QueryFilters;

export const DIMENSION_WORDS: Record<GroupBy | FilterDimension, { one: string; many: string }> = {
  day: { one: "day", many: "days" },
  week: { one: "week", many: "weeks" },
  month: { one: "month", many: "months" },
  carrier: { one: "carrier", many: "carriers" },
  region: { one: "region", many: "regions" },
  warehouse: { one: "warehouse", many: "warehouses" },
  origin: { one: "origin city", many: "origin cities" },
  destination: { one: "destination city", many: "destination cities" },
  category: { one: "product category", many: "product categories" },
  status: { one: "status", many: "statuses" },
  client: { one: "client", many: "clients" },
  promo: { one: "promo", many: "promo groups" },
  sku: { one: "SKU", many: "SKUs" },
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const FILTER_ORDER: readonly FilterDimension[] = [
  "carrier",
  "region",
  "warehouse",
  "origin",
  "destination",
  "category",
  "status",
  "client",
  "promo",
  "sku",
];

/** How a status reads in the UI and in sentences. */
export const STATUS_LABELS: Record<string, string> = {
  delivered: "Delivered",
  delayed: "Delayed",
  in_transit: "In transit",
  exception: "Exception",
  canceled: "Canceled",
};

/** A value as the UI shows it: statuses and promo read as words, everything else as in the data. */
export function valueLabel(dimension: FilterDimension, value: string): string {
  if (dimension === "status") return STATUS_LABELS[value] ?? value;
  if (dimension === "promo") return value === "yes" ? "Promo" : "No promo";
  return value;
}

export function dateFieldWords(field: DateField): string {
  return field === "order_date" ? "order date" : "delivery date";
}

/**
 * The filters in a fixed order, with statuses as the UI shows them ("status is In transit");
 * promo stays "yes" or "no", which reads better after "promo is" than a group label would.
 */
export function filterList(filters: QueryFilters | undefined): { dimension: FilterDimension; values: readonly string[] }[] {
  return FILTER_ORDER.flatMap((dimension) => {
    const values: readonly string[] | undefined = filters?.[dimension];
    if (values === undefined) return [];
    return [{ dimension, values: dimension === "status" ? values.map((value) => valueLabel(dimension, value)) : values }];
  });
}

/** The period as the question named it ("last month", "Q3"); undefined when the dates say it all. */
export function periodWords(period: QuerySpec["period"]): string | undefined {
  if (period === undefined) return "all the data";
  const year = (value: number | undefined) => (value === undefined ? "" : ` ${value}`);
  switch (period.type) {
    case "previous":
      return `last ${period.unit}`;
    case "last":
      return `last ${period.count} ${period.unit}${period.count === 1 ? "" : "s"}`;
    case "this":
      return `this ${period.unit}`;
    case "last_days":
      return `last ${period.days} day${period.days === 1 ? "" : "s"}`;
    case "month":
      return `${MONTH_NAMES[period.month - 1]}${year(period.year)}`;
    case "quarter":
      return `Q${period.quarter}${year(period.year)}`;
    case "all":
      return "all the data";
    case "range":
      return undefined;
  }
}
