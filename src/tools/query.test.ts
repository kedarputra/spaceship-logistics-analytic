import { describe, expect, it } from "vitest";
import { getDataset, type Order } from "@/domain/orders";
import { type QueryResult, runQuery } from "./query";
import { querySpecSchema } from "./spec";

function run(spec: Record<string, unknown>) {
  return runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
}

function resultOf(spec: Record<string, unknown>): QueryResult {
  const outcome = run(spec);
  if (outcome.kind !== "result") throw new Error(`Expected a result, got: ${outcome.message}`);
  return outcome;
}

function singleValue(spec: Record<string, unknown>): number | null {
  const [row] = resultOf(spec).rows;
  return row?.value ?? null;
}

describe("status-filter rewrite (ADR 0006 §2), one test per row, 2025 totals", () => {
  it("rewrites an order count with status delivered to on-time deliveries: 304", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["delivered"] } });
    expect(result.metric.id).toBe("on_time_deliveries");
    expect(result.rows[0]?.value).toBe(304);
    expect(result.rewrite).toEqual({ from: "order count with status delivered", to: "on-time deliveries" });
    expect(result.dateField).toBe("delivery_date");
  });

  it("rewrites status delayed to delayed orders: 55", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["delayed"] } });
    expect([result.metric.id, result.rows[0]?.value]).toEqual(["delayed_orders", 55]);
  });

  it("rewrites status exception to exception orders: 11", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["exception"] } });
    expect([result.metric.id, result.rows[0]?.value]).toEqual(["exception_orders", 11]);
  });

  it("rewrites all three delivered statuses to delivered orders: 370", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["exception", "delivered", "delayed"] } });
    expect([result.metric.id, result.rows[0]?.value]).toEqual(["delivered_orders", 370]);
  });

  it("leaves another mix of the delivered statuses as an order count, dated by delivery date: 359", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["delivered", "delayed"] } });
    expect([result.metric.id, result.rows[0]?.value, result.dateField, result.rewrite]).toEqual([
      "order_count",
      359,
      "delivery_date",
      undefined,
    ]);
  });

  it("leaves a status filter with in transit or canceled as an order count, dated by order date: 30", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["in_transit", "canceled"] } });
    expect([result.metric.id, result.rows[0]?.value, result.dateField, result.rewrite]).toEqual([
      "order_count",
      30,
      "order_date",
      undefined,
    ]);
  });

  it("carries a dateField override over to the rewritten metric", () => {
    const result = resultOf({
      metric: "order_count",
      filters: { status: ["delayed"] },
      dateField: "order_date",
      period: { type: "month", month: 11 },
    });
    expect([result.metric.id, result.dateField, result.rows[0]?.value]).toEqual(["delayed_orders", "order_date", 4]);
  });
});

describe("date field (ADR 0002 §5, golden numbers in docs/data.md)", () => {
  it("dates delayed orders by delivery date: 3 in November 2025 and 4 in December", () => {
    expect(singleValue({ metric: "delayed_orders", period: { type: "month", month: 11 } })).toBe(3);
    expect(singleValue({ metric: "delayed_orders", period: { type: "month", month: 12 } })).toBe(4);
  });

  it('dates them by order date when the question says "placed": 4 in November and 3 in December', () => {
    expect(singleValue({ metric: "delayed_orders", dateField: "order_date", period: { type: "month", month: 11 } })).toBe(4);
    expect(singleValue({ metric: "delayed_orders", dateField: "order_date", period: { type: "month", month: 12 } })).toBe(3);
  });

  it("states the resolved period and the date field it filtered on", () => {
    const result = resultOf({ metric: "delayed_orders", period: { type: "previous", unit: "month" } });
    expect(result.period).toEqual({ from: "2025-11-01", to: "2025-11-30", label: "1–30 Nov 2025" });
    expect(result.dateField).toBe("delivery_date");
  });
});

describe("rankings and small samples (ADR 0001 §6)", () => {
  it("flags GLS as the small-sample top carrier and names USPS as the top with at least 20 deliveries", () => {
    const result = resultOf({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 });
    expect(result.ranking?.case).toBe("small-sample-top");
    expect(result.ranking?.top).toMatchObject({ label: "GLS", numerator: 2, denominator: 8, n: 8, smallSample: true });
    expect(result.ranking?.topReliable).toMatchObject({ label: "USPS", numerator: 11, denominator: 47, smallSample: false });
    expect((result.ranking?.topReliable?.value ?? Number.NaN) * 100).toBeCloseTo(23.4, 1);
    expect(result.rows.map((row) => row.label)).toEqual(["GLS"]);
    expect(result.totalRows).toBe(9);
  });

  it("names the top region outright, since every region has at least 20 deliveries", () => {
    const result = resultOf({ metric: "delay_rate", groupBy: "region" });
    expect(result.ranking?.case).toBe("reliable");
    expect(result.rows.every((row) => !row.smallSample)).toBe(true);
    expect(result.ranking?.top).toBe(result.rows[0]);
  });

  it("names no winner by destination, where no group reaches 20, but still shows every group with its n", () => {
    const result = resultOf({ metric: "delay_rate", groupBy: "destination" });
    expect(result.ranking?.case).toBe("no-reliable-group");
    expect(result.ranking?.topReliable).toBeUndefined();
    expect(result.rows.every((row) => row.smallSample && row.n < 20)).toBe(true);
    expect(result.rows.reduce((sum, row) => sum + row.n, 0)).toBe(370);
  });

  it("sorts categories by value, highest first, and plain counts carry no small-sample flag", () => {
    const result = resultOf({ metric: "order_count", groupBy: "carrier" });
    expect(result.rows.slice(0, 2).map((row) => [row.label, row.value])).toEqual([
      ["FedEx", 89],
      ["UPS", 88],
    ]);
    expect(result.rows.some((row) => row.smallSample)).toBe(false);
    expect(result.ranking).toBeUndefined();
  });
});

describe("every group is ranked (ADR 0001 §6)", () => {
  function order(carrier: string, status: Order["status"], deliveryDate: string | null): Order {
    return {
      client_id: "CL-1000",
      order_id: `ORD-${carrier}-${status}`,
      order_date: "2025-05-01",
      delivery_date: deliveryDate,
      carrier,
      origin_city: "London, UK",
      destination_city: "Leeds, UK",
      status,
      sku: "PAPER-0001",
      product_category: "PAPER",
      quantity: 1,
      unit_price_usd: 10,
      order_value_usd: 10,
      is_promo: false,
      promo_discount_pct: 0,
      region: "UK",
      warehouse: "LON-FC1",
    };
  }

  it("keeps a carrier with no delivery in the period, last and with no rate, as the dashboard does", () => {
    const dataset = {
      orders: [order("DHL", "delayed", "2025-05-06"), order("GLS", "in_transit", null), order("UPS", "delivered", "2025-04-02")],
      anchor: "2025-05-31",
    };
    const spec = querySpecSchema.parse({ tool: "query", metric: "delay_rate", groupBy: "carrier", period: { type: "month", month: 5 } });
    const result = runQuery(spec, dataset);
    if (result.kind !== "result") throw new Error(result.message);
    expect(result.rows.map((row) => [row.label, row.numerator, row.denominator, row.value])).toEqual([
      ["DHL", 1, 1, 1],
      ["GLS", 0, 0, null],
      ["UPS", 0, 0, null],
    ]);
  });

  it("ranks the 9 carriers of 2025 by delay rate: GLS 2/8, USPS 11/47, UPS 17/78, Royal Mail 5/25 first", () => {
    const result = resultOf({ metric: "delay_rate", groupBy: "carrier" });
    expect(result.rows.slice(0, 4).map((row) => [row.label, row.numerator, row.denominator])).toEqual([
      ["GLS", 2, 8],
      ["USPS", 11, 47],
      ["UPS", 17, 78],
      ["Royal Mail", 5, 25],
    ]);
    expect(result.rows.filter((row) => row.smallSample).map((row) => [row.label, row.n])).toEqual([
      ["GLS", 8],
      ["DPD", 18],
    ]);
  });
});

describe("only groups with enough deliveries (minDelivered)", () => {
  it("keeps the 7 carriers with at least 20 deliveries, so USPS (11/47) tops a reliable ranking", () => {
    const result = resultOf({ metric: "delay_rate", groupBy: "carrier", minDelivered: 20 });
    expect(result.rows).toHaveLength(7);
    expect(result.rows.some((row) => row.label === "GLS" || row.label === "DPD")).toBe(false);
    expect(result.ranking?.case).toBe("reliable");
    expect(result.ranking?.top).toMatchObject({ label: "USPS", numerator: 11, denominator: 47 });
  });
});

describe("the data's coverage travels with the result", () => {
  it("says the data covers 1 Jan–31 Dec 2025", () => {
    expect(resultOf({ metric: "order_count" }).coverage).toEqual({ from: "2025-01-01", to: "2025-12-31", label: "1 Jan–31 Dec 2025" });
  });
});

describe("filters stay what the question asked (ADR 0006 §2)", () => {
  it("keeps the status filter after a rewrite, so grouping by status shows only the statuses asked for", () => {
    const result = resultOf({ metric: "order_count", filters: { status: ["delayed"] }, groupBy: "status" });
    expect(result.rows.map((row) => [row.label, row.value])).toEqual([["delayed", 55]]);
  });
});

describe("the other breakdowns", () => {
  it("splits the 370 deliveries of 2025 by month into on time, delayed and exception: 3 delayed in November", () => {
    const result = resultOf({ metric: "delivery_outcomes", groupBy: "month" });
    expect(result.metric.label).toBe("Delivery outcomes");
    expect(result.rows.find((row) => row.label === "Nov 2025")?.outcomes?.delayed).toBe(3);
    const total = (outcome: "onTime" | "delayed" | "exception") =>
      result.rows.reduce((sum, row) => sum + (row.outcomes?.[outcome] ?? 0), 0);
    expect([total("onTime"), total("delayed"), total("exception")]).toEqual([304, 55, 11]);
    expect(result.matchingOrders?.total).toBe(370);
  });

  it("counts orders by day, a day with no orders as 0 (counted from the CSV)", () => {
    const result = resultOf({ metric: "order_count", groupBy: "day", period: { type: "range", from: "2025-01-01", to: "2025-01-07" } });
    expect(result.rows.map((row) => [row.label, row.value])).toEqual([
      ["1 Jan", 7],
      ["2 Jan", 1],
      ["3 Jan", 6],
      ["4 Jan", 2],
      ["5 Jan", 0],
      ["6 Jan", 3],
      ["7 Jan", 3],
    ]);
  });

  it("splits orders into the 22 promo orders and the 378 others", () => {
    const result = resultOf({ metric: "order_count", groupBy: "promo" });
    expect(result.rows.map((row) => [row.label, row.value])).toEqual([
      ["No promo", 378],
      ["Promo", 22],
    ]);
    expect(singleValue({ metric: "order_count", filters: { promo: ["Yes"] } })).toBe(22);
  });

  it("gives each time bucket its dates inside the period, so a partial week can say which days it covers", () => {
    const [first] = resultOf({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } }).rows;
    expect(first).toMatchObject({ label: "w/c 29 Sep", from: "2025-10-01", to: "2025-10-05", partial: true });
  });
});

describe("matching orders (ADR 0006 §7)", () => {
  it("lists up to 50 of the orders a count is made of, with the total", () => {
    const result = resultOf({ metric: "order_count" });
    expect(result.matchingOrders?.total).toBe(400);
    expect(result.matchingOrders?.orders).toHaveLength(50);
  });

  it("lists exactly the 3 orders delivered late last month", () => {
    const orders = resultOf({ metric: "delayed_orders", period: { type: "previous", unit: "month" } }).matchingOrders;
    expect(orders?.total).toBe(3);
    expect(orders?.orders.every((order) => order.status === "delayed" && (order.delivery_date ?? "").startsWith("2025-11"))).toBe(true);
  });

  it("lists no orders for a rate", () => {
    expect(resultOf({ metric: "on_time_rate" }).matchingOrders).toBeUndefined();
  });
});

describe("periods with no data (ADR 0002 §6)", () => {
  it('answers "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025."', () => {
    expect(run({ metric: "order_count", period: { type: "previous", unit: "year" } })).toEqual({
      kind: "no-data",
      message: "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025.",
    });
  });
});
