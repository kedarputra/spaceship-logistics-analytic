import { z } from "zod";
import { METRICS, type MetricId } from "@/domain/definitions";
import { getDataset, type Order, ORDER_STATUSES } from "@/domain/orders";
import { matchValue, unknownValueMessage } from "./values";

/**
 * The query spec: the whitelist of ADR 0006. The AI layer produces one, code validates it here,
 * and only a valid spec is run. Unknown fields and values are rejected, never guessed. Tags are
 * z.enum, never z.literal (ADR 0009).
 */

/** ADR 0006 §1, plus the built-in delivery-outcomes breakdown over time (§3). */
export const QUERY_METRICS = [
  "order_count",
  "delivered_orders",
  "on_time_deliveries",
  "delayed_orders",
  "exception_orders",
  "on_time_rate",
  "delay_rate",
  "average_delivery_time",
  "units",
  "gross_order_value",
  "net_order_value",
  "delivery_outcomes",
] as const;

// Fails to compile if a metric in domain/definitions is missing from the whitelist.
const everyMetricListed: [Exclude<MetricId, (typeof QUERY_METRICS)[number]>] extends [never] ? true : never = true;
void everyMetricListed;

export const TIME_DIMENSIONS = ["day", "week", "month"] as const;
export const CATEGORY_DIMENSIONS = [
  "carrier",
  "region",
  "warehouse",
  "origin",
  "destination",
  "category",
  "status",
  "client",
  "promo",
] as const;

/** The small dimensions, as schema enums. A test checks they are exactly the values in the data. */
export const DIMENSION_VALUES = {
  carrier: ["DHL", "DPD", "FedEx", "GLS", "LaserShip", "OnTrac", "Royal Mail", "UPS", "USPS"],
  region: ["EU", "UK", "US-C", "US-E", "US-W"],
  warehouse: ["AMS-FC1", "ATL-DC1", "BER-FC1", "CHI-DC1", "DFW-DC1", "EWR-DC1", "LAX-DC1", "LON-FC1", "SFO-DC2"],
  origin: [
    "Amsterdam, NL",
    "Atlanta, GA",
    "Berlin, DE",
    "Chicago, IL",
    "Dallas, TX",
    "London, UK",
    "Los Angeles, CA",
    "Newark, NJ",
    "San Francisco, CA",
  ],
  category: ["BOOK", "BRUSH", "CRAYON", "MARKER", "PAINT", "PAPER", "PENCIL", "STICKER"],
  status: ORDER_STATUSES,
} as const;

const MAX_VALUES = 20;

/** A list of values from a small dimension: any case, cities also by short name, then the enum. */
function enumValues<const T extends readonly [string, ...string[]]>(dimension: string, values: T, cities = false) {
  const value = z.preprocess(
    (input) => (typeof input === "string" ? (matchValue(input, values, cities) ?? input) : input),
    z.enum(values, { error: (issue) => unknownValueMessage(dimension, issue.input, values, { cities, listable: true }) }),
  );
  return z.array(value).min(1).max(MAX_VALUES);
}

const distinctValues = new Map<keyof Order, readonly string[]>();

/** The distinct values of an order field, read from the data once. */
function valuesInData(field: "destination_city" | "client_id" | "sku"): readonly string[] {
  let values = distinctValues.get(field);
  if (values === undefined) {
    values = [...new Set(getDataset().orders.map((order) => order[field]))].sort();
    distinctValues.set(field, values);
  }
  return values;
}

/** A list of values from a large dimension (destination, client, SKU), checked against the data. */
function dataValues(dimension: string, field: "destination_city" | "client_id" | "sku", cities = false) {
  const value = z.preprocess(
    (input) => (typeof input === "string" ? (matchValue(input, valuesInData(field), cities) ?? input) : input),
    z
      .string()
      .min(1)
      .max(80)
      .refine((input) => valuesInData(field).includes(input), {
        error: (issue) => unknownValueMessage(dimension, issue.input, valuesInData(field), { cities, listable: false }),
      }),
  );
  return z.array(value).min(1).max(MAX_VALUES);
}

export const filtersSchema = z.strictObject({
  carrier: enumValues("carrier", DIMENSION_VALUES.carrier).optional(),
  region: enumValues("region", DIMENSION_VALUES.region).optional(),
  warehouse: enumValues("warehouse", DIMENSION_VALUES.warehouse).optional(),
  origin: enumValues("origin", DIMENSION_VALUES.origin, true).optional(),
  category: enumValues("category", DIMENSION_VALUES.category).optional(),
  status: enumValues("status", DIMENSION_VALUES.status).optional(),
  promo: enumValues("promo", ["yes", "no"]).optional(),
  destination: dataValues("destination", "destination_city", true).optional(),
  client: dataValues("client", "client_id").optional(),
  sku: dataValues("SKU", "sku").optional(),
});

const periodUnit = z.enum(["week", "month", "quarter", "year"]);
const year = z.number().int().min(2000).max(2100);

/** A symbolic period (ADR 0002 §1); domain/periods resolves it against the data. */
export const periodSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["previous"]), unit: periodUnit }),
  z.strictObject({ type: z.enum(["last"]), count: z.number().int().min(1).max(36), unit: periodUnit }),
  z.strictObject({ type: z.enum(["this"]), unit: periodUnit }),
  z.strictObject({ type: z.enum(["last_days"]), days: z.number().int().min(1).max(366) }),
  z.strictObject({ type: z.enum(["month"]), month: z.number().int().min(1).max(12), year: year.optional() }),
  z.strictObject({ type: z.enum(["quarter"]), quarter: z.number().int().min(1).max(4), year: year.optional() }),
  z
    .strictObject({ type: z.enum(["range"]), from: z.iso.date(), to: z.iso.date() })
    .refine((range) => range.from <= range.to, { message: "The range ends before it starts", path: ["to"] }),
  z.strictObject({ type: z.enum(["all"]) }),
]);

export const querySpecSchema = z
  .strictObject({
    tool: z.enum(["query"]),
    metric: z.enum(QUERY_METRICS),
    /** At most one group-by (ADR 0006 §3). SKU is a filter only. */
    groupBy: z.enum([...TIME_DIMENSIONS, ...CATEGORY_DIMENSIONS]).optional(),
    filters: filtersSchema.optional(),
    /** Omitted: everything the data covers. */
    period: periodSchema.optional(),
    /** Set only when the question names the order date ("delayed orders placed last month"). */
    dateField: z.enum(["order_date"]).optional(),
    sort: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .refine((spec) => spec.metric !== "delivery_outcomes" || spec.groupBy === "week" || spec.groupBy === "month", {
    message: "Delivery outcomes are broken down by week or month only",
    path: ["groupBy"],
  })
  // "Delay rate of delayed orders" is 100% by construction: the status is what a rate or average measures.
  .refine((spec) => spec.filters?.status === undefined || !isRateOrAverage(spec.metric), {
    message: "A rate or an average cannot be filtered by status: the status is what it measures. Ask for a count instead.",
    path: ["filters", "status"],
  });

function isRateOrAverage(metric: (typeof QUERY_METRICS)[number]): boolean {
  if (metric === "delivery_outcomes") return false;
  const { kind } = METRICS[metric];
  return kind === "rate" || kind === "average";
}

export type QuerySpec = z.output<typeof querySpecSchema>;
export type QueryFilters = z.output<typeof filtersSchema>;
export type GroupBy = NonNullable<QuerySpec["groupBy"]>;
