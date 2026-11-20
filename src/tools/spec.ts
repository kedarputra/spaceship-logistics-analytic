import { z } from "zod";
import {
  DELIVERY_OUTCOMES_DEFINITION,
  isRateOrAverage as isRateOrAverageKind,
  METRICS,
  type MetricId,
  ORDER_SHARE_DEFINITION,
} from "@/domain/definitions";
import { getDataset, type Order, ORDER_STATUSES } from "@/domain/orders";
import { EXAMPLE_IDS, UNSUPPORTED_REASON_IDS } from "./examples";
import { matchValue, unknownValueMessage } from "./values";

/**
 * The query spec: the whitelist of ADR 0006. The AI layer produces one, code validates it here,
 * and only a valid spec is run. Unknown fields and values are rejected, never guessed. Tags are
 * z.enum, never z.literal (ADR 0009).
 */

/** ADR 0006 §1, plus the built-in delivery-outcomes breakdown over time (§3) and the share of orders (§1, amended). */
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
  "order_share",
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

/** One value of a small dimension: any case, cities also by short name, then the enum. */
function enumValue<const T extends readonly [string, ...string[]]>(dimension: string, values: T, cities = false) {
  return z.preprocess(
    (input) => (typeof input === "string" ? (matchValue(input, values, cities) ?? input) : input),
    z.enum(values, { error: (issue) => unknownValueMessage(dimension, issue.input, values, { cities, listable: true }) }),
  );
}

/** A list of values from a small dimension. */
function enumValues<const T extends readonly [string, ...string[]]>(dimension: string, values: T, cities = false) {
  return z.array(enumValue(dimension, values, cities)).min(1).max(MAX_VALUES);
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

/** ADR 0006 §8: the metric each ambiguous word defaults to. */
export const ASSUMED_METRIC = {
  best: "on_time_rate",
  performance: "on_time_rate",
  late: "delayed_orders",
} as const satisfies Record<string, MetricId>;

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
    /** Keep only groups with at least this many delivered orders ("among carriers with at least 20 deliveries"). */
    minDelivered: z.number().int().min(1).max(100).optional(),
    /** The ambiguous word the question used, read with its documented default (ADR 0006 §8). */
    assumption: z.enum(["best", "performance", "late"] satisfies (keyof typeof ASSUMED_METRIC)[]).optional(),
  })
  .refine((spec) => spec.metric !== "delivery_outcomes" || spec.groupBy === "week" || spec.groupBy === "month", {
    message: "Delivery outcomes are broken down by week or month only",
    path: ["groupBy"],
  })
  // "Delay rate of delayed orders" is 100% by construction: the status is what a rate or average measures.
  .refine((spec) => spec.filters?.status === undefined || !dividesByDelivered(spec.metric), {
    message: "A rate or an average cannot be filtered by status: the status is what it measures. Ask for a count instead.",
    path: ["filters", "status"],
  })
  .refine((spec) => spec.minDelivered === undefined || dividesByDelivered(spec.metric), {
    message: "minDelivered applies to rates and averages only.",
    path: ["minDelivered"],
  })
  // Weeks and a single value are never dropped (ADR 0002 §4: empty buckets are 0, not gaps).
  .refine((spec) => spec.minDelivered === undefined || (spec.groupBy !== undefined && !isTimeDimension(spec.groupBy)), {
    message: "minDelivered keeps only the groups of a breakdown by category, so it needs one.",
    path: ["minDelivered"],
  })
  .superRefine((spec, context) => {
    if (spec.assumption === undefined || ASSUMED_METRIC[spec.assumption] === spec.metric) return;
    const metric = ASSUMED_METRIC[spec.assumption] === "on_time_rate" ? "the on-time rate" : "delayed orders";
    context.addIssue({ code: "custom", message: `The assumption "${spec.assumption}" goes with ${metric} only.`, path: ["assumption"] });
  });

/** A demand forecast (ADR 0003 §1, §6, §9): the total, or one category, warehouse, region, or SKU. */
export const forecastSpecSchema = z.strictObject({
  tool: z.enum(["forecast"]),
  scope: z.discriminatedUnion("type", [
    z.strictObject({ type: z.enum(["total"]) }),
    z.strictObject({ type: z.enum(["category"]), value: enumValue("category", DIMENSION_VALUES.category) }),
    z.strictObject({ type: z.enum(["warehouse"]), value: enumValue("warehouse", DIMENSION_VALUES.warehouse) }),
    z.strictObject({ type: z.enum(["region"]), value: enumValue("region", DIMENSION_VALUES.region) }),
    // Checked by the forecast tool, which explains an unknown SKU (ADR 0003 §9).
    z.strictObject({ type: z.enum(["sku"]), value: z.string().trim().min(1).max(40) }),
  ]),
  /** Omitted: 3 months. The forecast tool caps it and turns weeks into months (ADR 0003 §6). */
  horizon: z.strictObject({ count: z.number().int().min(1).max(52), unit: z.enum(["month", "week"]) }).optional(),
});

/** A question outside the whitelist: why, and 3 example questions from the fixed list (ADR 0006 §8). */
export const unsupportedSchema = z.strictObject({
  tool: z.enum(["unsupported"]),
  reason: z.enum(UNSUPPORTED_REASON_IDS),
  examples: z
    .array(z.enum(EXAMPLE_IDS))
    .length(3)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Pick 3 different example questions" }),
});

/** The one structured output the model returns for a question (ADR 0009 §3). */
export const interpretationSchema = z.discriminatedUnion("tool", [querySpecSchema, forecastSpecSchema, unsupportedSchema]);

/** Each metric's one-line definition and date field, for the model's prompt (ai/ cannot read domain/). */
export const METRIC_GUIDE: readonly { id: (typeof QUERY_METRICS)[number]; definition: string; dateField: string }[] = [
  ...Object.entries(METRICS).map(([id, metric]) => ({ id: metricId(id), definition: metric.definition, dateField: metric.dateField })),
  { id: "delivery_outcomes", definition: DELIVERY_OUTCOMES_DEFINITION.definition, dateField: DELIVERY_OUTCOMES_DEFINITION.dateField },
  { id: "order_share", definition: ORDER_SHARE_DEFINITION.definition, dateField: ORDER_SHARE_DEFINITION.dateField },
];

function metricId(id: string): (typeof QUERY_METRICS)[number] {
  const found = QUERY_METRICS.find((metric) => metric === id);
  if (found === undefined) throw new Error(`Metric ${id} is missing from QUERY_METRICS`);
  return found;
}

function dividesByDelivered(metric: (typeof QUERY_METRICS)[number]): boolean {
  // Neither built-in metric divides by delivered orders, so a status filter is fine and minDelivered means nothing.
  if (metric === "delivery_outcomes" || metric === "order_share") return false;
  return isRateOrAverageKind(METRICS[metric].kind);
}

export function isTimeDimension(
  groupBy: (typeof TIME_DIMENSIONS)[number] | (typeof CATEGORY_DIMENSIONS)[number],
): groupBy is (typeof TIME_DIMENSIONS)[number] {
  return TIME_DIMENSIONS.some((dimension) => dimension === groupBy);
}

export type QuerySpec = z.output<typeof querySpecSchema>;
export type QueryFilters = z.output<typeof filtersSchema>;
export type GroupBy = NonNullable<QuerySpec["groupBy"]>;
export type Interpretation = z.output<typeof interpretationSchema>;
