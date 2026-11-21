import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { ordersBehind } from "./orders-behind";
import { type QueryResult, runQuery } from "./query";
import { querySpecSchema } from "./spec";

function resultOf(spec: Record<string, unknown>): QueryResult {
  const result = runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
  if (result.kind !== "result") throw new Error(result.message);
  return result;
}

const behind = (spec: Record<string, unknown>) => ordersBehind(resultOf(spec), getDataset().orders);

const DELIVERED = ["delivered", "delayed", "exception"];

// Expected figures: docs/data.md.
describe("the orders behind a query answer, as a Raw data view (ticket 29)", () => {
  it("a filtered rate: the USPS delay rate is over its 47 delivered orders; with no period, no range, on the answer's date field", () => {
    const result = resultOf({ metric: "delay_rate", filters: { carrier: ["USPS"] } });
    expect(ordersBehind(result, getDataset().orders)).toEqual({
      view: { filters: { carrier: ["USPS"], status: DELIVERED }, dates: { basis: "delivery" }, search: "", page: 1 },
      count: 47,
    });
    expect(result.rows[0]?.denominator).toBe(47);
  });

  it("a period: delayed orders in Nov 2025 are 3 by delivery date and 4 by order date, on the answer's date field", () => {
    const byDelivery = resultOf({ metric: "delayed_orders", period: { type: "month", month: 11, year: 2025 } });
    expect(ordersBehind(byDelivery, getDataset().orders)).toEqual({
      view: { filters: { status: ["delayed"] }, dates: { basis: "delivery", range: { from: "2025-11", to: "2025-11" } }, search: "", page: 1 },
      count: 3,
    });
    expect(byDelivery.matchingOrders?.total).toBe(3);
    const byOrder = resultOf({ metric: "delayed_orders", period: { type: "month", month: 11, year: 2025 }, dateField: "order_date" });
    expect(ordersBehind(byOrder, getDataset().orders)).toMatchObject({ view: { dates: { basis: "order", range: { from: "2025-11", to: "2025-11" } } }, count: 4 });
  });

  it("reads a relative period as the months it resolved to: the last 3 months are Oct–Dec 2025", () => {
    expect(behind({ metric: "delayed_orders", period: { type: "last", count: 3, unit: "month" } })).toMatchObject({
      view: { dates: { basis: "delivery", range: { from: "2025-10", to: "2025-12" } } },
      count: 10,
    });
  });

  it("clips a period that runs past the data to the months it has", () => {
    expect(behind({ metric: "order_count", period: { type: "last", count: 2, unit: "year" } })).toMatchObject({
      view: { dates: { basis: "order", range: { from: "2025-01", to: "2025-12" } } },
      count: 400,
    });
  });

  it("counts the same orders as each metric's answer: what a count counts, the delivered orders of a rate or an average, every order of a sum", () => {
    const expected: [string, number, Record<string, unknown>?][] = [
      ["order_count", 400],
      ["delivered_orders", 370],
      ["on_time_deliveries", 304],
      ["delayed_orders", 55],
      ["exception_orders", 11],
      ["on_time_rate", 370],
      ["delay_rate", 370],
      ["average_delivery_time", 370],
      ["units", 400],
      ["gross_order_value", 400],
      ["net_order_value", 400],
      ["delivery_outcomes", 370, { groupBy: "month" }],
      ["order_share", 400],
    ];
    for (const [metric, count, extra] of expected) expect(behind({ metric, ...extra })?.count, metric).toBe(count);
  });

  it("keeps a breakdown's orders, all of them, and a status filter on a count: delayed or exception, 66", () => {
    expect(behind({ metric: "delay_rate", groupBy: "carrier" })?.count).toBe(370);
    expect(behind({ metric: "order_count", filters: { status: ["delayed", "exception"] } })).toMatchObject({
      view: { filters: { status: ["delayed", "exception"] }, dates: { basis: "delivery" } },
      count: 66,
    });
  });

  it("has nothing to open when a part of the spec has no Raw data filter, or no order is behind it", () => {
    expect(behind({ metric: "order_count", filters: { sku: ["CRAYON-0008"] } })).toBeUndefined();
    expect(behind({ metric: "order_count", filters: { origin: ["London, UK"] } })).toBeUndefined();
    expect(behind({ metric: "delay_rate", groupBy: "carrier", limit: 3 })).toBeUndefined();
    expect(behind({ metric: "delay_rate", groupBy: "carrier", minDelivered: 20 })).toBeUndefined();
    expect(behind({ metric: "delayed_orders", period: { type: "last_days", days: 30 } })).toBeUndefined();
    expect(behind({ metric: "delayed_orders", filters: { status: ["delivered"] } })).toBeUndefined();
  });
});
