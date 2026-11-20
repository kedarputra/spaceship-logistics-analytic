import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getDataset } from "@/domain/orders";
import { DIMENSION_VALUES, interpretationSchema, querySpecSchema } from "./spec";

function errorsOf(input: unknown): string[] {
  const result = querySpecSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function filtersOf(filters: Record<string, string[]>) {
  return querySpecSchema.parse({ tool: "query", metric: "order_count", filters }).filters;
}

describe("query spec: the whitelist (ADR 0006 §1, §3–5)", () => {
  it("accepts a metric on its own, and a metric with one group-by, filters, a period, sort and limit", () => {
    expect(querySpecSchema.safeParse({ tool: "query", metric: "order_count" }).success).toBe(true);
    const spec = {
      tool: "query",
      metric: "delay_rate",
      groupBy: "carrier",
      filters: { region: ["US-E"] },
      period: { type: "last", count: 3, unit: "month" },
      sort: "desc",
      limit: 5,
    };
    expect(querySpecSchema.parse(spec)).toEqual(spec);
  });

  it("rejects a field it does not know, at the top or among the filters, instead of guessing", () => {
    expect(errorsOf({ tool: "query", metric: "order_count", sql: "DROP TABLE orders" })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_count", filters: { quantity: ["5"] } })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "revenue_per_click" })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_count", groupBy: "sku" })).not.toEqual([]);
  });

  it("allows a limit from 1 to 20 only", () => {
    expect(errorsOf({ tool: "query", metric: "order_count", groupBy: "carrier", limit: 1 })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_count", groupBy: "carrier", limit: 20 })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_count", groupBy: "carrier", limit: 0 })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_count", groupBy: "carrier", limit: 21 })).not.toEqual([]);
  });

  it("allows delivery outcomes only by week or month (the built-in stacked breakdown)", () => {
    expect(errorsOf({ tool: "query", metric: "delivery_outcomes", groupBy: "week" })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delivery_outcomes", groupBy: "carrier" })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delivery_outcomes" })).not.toEqual([]);
  });

  it("rejects a status filter on a rate or an average, where the status is what is being measured", () => {
    expect(errorsOf({ tool: "query", metric: "delay_rate", filters: { status: ["delayed"] } })).toEqual([
      "A rate or an average cannot be filtered by status: the status is what it measures. Ask for a count instead.",
    ]);
    expect(errorsOf({ tool: "query", metric: "delayed_orders", filters: { status: ["delayed"] } })).toEqual([]);
  });

  it("allows minDelivered (1–100) on rates and averages only, where n is the delivered orders", () => {
    expect(errorsOf({ tool: "query", metric: "delay_rate", groupBy: "carrier", minDelivered: 20 })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delay_rate", groupBy: "carrier", minDelivered: 0 })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delay_rate", groupBy: "carrier", minDelivered: 101 })).not.toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_count", groupBy: "carrier", minDelivered: 20 })).toEqual([
      "minDelivered applies to rates and averages only.",
    ]);
  });

  it("allows minDelivered only with a category group-by, since weeks and single values are never dropped", () => {
    const message = "minDelivered keeps only the groups of a breakdown by category, so it needs one.";
    expect(errorsOf({ tool: "query", metric: "delay_rate", minDelivered: 20 })).toEqual([message]);
    expect(errorsOf({ tool: "query", metric: "delay_rate", groupBy: "week", minDelivered: 20 })).toEqual([message]);
  });

  it("takes a share of orders with any filter, status included, but no minDelivered", () => {
    expect(errorsOf({ tool: "query", metric: "order_share", filters: { status: ["delayed"] } })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "order_share", groupBy: "carrier", minDelivered: 20 })).toEqual([
      "minDelivered applies to rates and averages only.",
    ]);
  });

  it('allows only "order_date" as a date-field override', () => {
    expect(errorsOf({ tool: "query", metric: "delayed_orders", dateField: "order_date" })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delayed_orders", dateField: "ship_date" })).not.toEqual([]);
  });

  it("rejects a period that cannot be resolved: an impossible date, a range that ends first, zero months", () => {
    const withPeriod = (period: unknown) => ({ tool: "query", metric: "order_count", period });
    expect(errorsOf(withPeriod({ type: "range", from: "2025-02-30", to: "2025-03-01" }))).not.toEqual([]);
    expect(errorsOf(withPeriod({ type: "range", from: "2025-03-02", to: "2025-03-01" }))).not.toEqual([]);
    expect(errorsOf(withPeriod({ type: "last", count: 0, unit: "month" }))).not.toEqual([]);
    expect(errorsOf(withPeriod({ type: "month", month: 13 }))).not.toEqual([]);
  });
});

describe("ambiguous defaults (ADR 0006 §8)", () => {
  it("records which ambiguous word was read with its default, on the metric that default means", () => {
    expect(errorsOf({ tool: "query", metric: "on_time_rate", groupBy: "carrier", assumption: "best" })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "on_time_rate", assumption: "performance" })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delayed_orders", assumption: "late" })).toEqual([]);
    expect(errorsOf({ tool: "query", metric: "delay_rate", assumption: "best" })).toEqual([
      'The assumption "best" goes with the on-time rate only.',
    ]);
    expect(errorsOf({ tool: "query", metric: "order_count", assumption: "late" })).toEqual([
      'The assumption "late" goes with delayed orders only.',
    ]);
  });
});

describe("the interpretation: one structured output for the model (ADR 0009 §3)", () => {
  const accepts = (input: unknown) => interpretationSchema.safeParse(input).success;
  const EXAMPLES = ["late_last_month", "delayed_by_week", "highest_delay_rate"];

  it("is a query spec, a forecast spec, or an unsupported question", () => {
    expect(accepts({ tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" } })).toBe(true);
    expect(accepts({ tool: "forecast", scope: { type: "total" } })).toBe(true);
    expect(accepts({ tool: "unsupported", reason: "numeric_filter", examples: EXAMPLES })).toBe(true);
    expect(accepts({ tool: "sql", query: "SELECT 1" })).toBe(false);
  });

  it("takes a forecast for the total, one category, warehouse or region, or a SKU, with an optional horizon", () => {
    expect(interpretationSchema.parse({ tool: "forecast", scope: { type: "category", value: "crayon" }, horizon: { count: 4, unit: "month" } })).toEqual({
      tool: "forecast",
      scope: { type: "category", value: "CRAYON" },
      horizon: { count: 4, unit: "month" },
    });
    expect(accepts({ tool: "forecast", scope: { type: "warehouse", value: "LON-FC1" } })).toBe(true);
    expect(accepts({ tool: "forecast", scope: { type: "sku", value: "CRAYON-0008" } })).toBe(true);
    expect(accepts({ tool: "forecast", scope: { type: "carrier", value: "UPS" } })).toBe(false);
    expect(accepts({ tool: "forecast", scope: { type: "total" }, horizon: { count: 0, unit: "month" } })).toBe(false);
  });

  it("names the reason and picks exactly 3 example questions from the fixed list, never writing its own", () => {
    expect(accepts({ tool: "unsupported", reason: "numeric_filter", examples: EXAMPLES.slice(0, 2) })).toBe(false);
    expect(accepts({ tool: "unsupported", reason: "numeric_filter", examples: [...EXAMPLES.slice(0, 2), "How tall is UPS?"] })).toBe(false);
    expect(accepts({ tool: "unsupported", reason: "because I said so", examples: EXAMPLES })).toBe(false);
  });

  it("tags every variant with z.enum, so its JSON Schema has no const (ADR 0009 §3)", () => {
    const schema = JSON.stringify(z.toJSONSchema(interpretationSchema));
    expect(schema).not.toContain('"const"');
    expect(schema).toContain('"enum":["forecast"]');
  });
});

describe("filter values (ADR 0006 §4)", () => {
  it("matches values whatever their case", () => {
    expect(filtersOf({ carrier: ["fedex", "ups"], category: ["crayon"], status: ["DELAYED"] })).toEqual({
      carrier: ["FedEx", "UPS"],
      category: ["CRAYON"],
      status: ["delayed"],
    });
    expect(filtersOf({ client: ["cl-1001"], sku: ["book-0006"] })).toEqual({ client: ["CL-1001"], sku: ["BOOK-0006"] });
    expect(filtersOf({ promo: ["Yes"] })).toEqual({ promo: ["yes"] });
  });

  it('matches an origin or destination by the city name before the comma: "austin" is "Austin, TX"', () => {
    expect(filtersOf({ destination: ["austin"], origin: ["london"] })).toEqual({
      destination: ["Austin, TX"],
      origin: ["London, UK"],
    });
  });

  it('suggests the near miss: "fedx" gets "Did you mean "FedEx"?"', () => {
    expect(errorsOf({ tool: "query", metric: "order_count", filters: { carrier: ["fedx"] } })).toEqual([
      'Unknown carrier "fedx". Did you mean "FedEx"?',
    ]);
    expect(errorsOf({ tool: "query", metric: "order_count", filters: { destination: ["Austn"] } })).toEqual([
      'Unknown destination "Austn". Did you mean "Austin, TX"?',
    ]);
  });

  it("rejects a value that is not in the data, naming the known values when there are few", () => {
    expect(errorsOf({ tool: "query", metric: "order_count", filters: { region: ["APAC"] } })).toEqual([
      'Unknown region "APAC". Known values: EU, UK, US-C, US-E, US-W.',
    ]);
    expect(errorsOf({ tool: "query", metric: "order_count", filters: { destination: ["Atlantis"] } })).toEqual([
      'Unknown destination "Atlantis". It is not in the data.',
    ]);
  });
});

describe("the dimension values the schema knows are the data's (ADR 0006 §4)", () => {
  const { orders } = getDataset();
  const distinct = (values: string[]) => [...new Set(values)].sort();

  it("lists exactly the carriers, regions, warehouses, origins, categories and statuses in the data", () => {
    expect([...DIMENSION_VALUES.carrier].sort()).toEqual(distinct(orders.map((order) => order.carrier)));
    expect([...DIMENSION_VALUES.region].sort()).toEqual(distinct(orders.map((order) => order.region)));
    expect([...DIMENSION_VALUES.warehouse].sort()).toEqual(distinct(orders.map((order) => order.warehouse)));
    expect([...DIMENSION_VALUES.origin].sort()).toEqual(distinct(orders.map((order) => order.origin_city)));
    expect([...DIMENSION_VALUES.category].sort()).toEqual(distinct(orders.map((order) => order.product_category)));
    expect([...DIMENSION_VALUES.status].sort()).toEqual(distinct(orders.map((order) => order.status)));
  });

  it("can match cities by short name: unique within each column, and no city both an origin and a destination", () => {
    const shortName = (city: string) => (city.split(",")[0] ?? city).trim().toLowerCase();
    const origins = distinct(orders.map((order) => order.origin_city)).map(shortName);
    const destinations = distinct(orders.map((order) => order.destination_city)).map(shortName);
    expect(new Set(origins).size).toBe(origins.length);
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(origins.filter((city) => destinations.includes(city))).toEqual([]);
  });
});
