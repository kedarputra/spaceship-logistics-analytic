import { describe, expect, it } from "vitest";
import { getDataset, type Order } from "@/domain/orders";
import { clientRows, lanes as laneFigures, warehouseScorecard } from "./network";
import { runQuery } from "./query";
import { querySpecSchema } from "./spec";

/** One order shipped from `warehouse`, delivered on time or late, `days` after it was placed. */
function shipped(warehouse: string, status: Order["status"], overrides: Partial<Order> = {}): Order {
  return {
    client_id: "CL-1000",
    order_id: `ORD-${warehouse}-${status}`,
    order_date: "2025-05-01",
    delivery_date: status === "in_transit" || status === "canceled" ? null : "2025-05-04",
    carrier: "DHL",
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
    warehouse,
    ...overrides,
  };
}

/** `onTime` on-time and `late` delayed deliveries from `warehouse`. */
function deliveries(warehouse: string, onTime: number, late: number): Order[] {
  return [...Array.from({ length: onTime }, () => shipped(warehouse, "delivered")), ...Array.from({ length: late }, () => shipped(warehouse, "delayed"))];
}

const percent = (value: number | null) => (value === null ? null : Number((value * 100).toFixed(1)));
const twoDecimals = (value: number | null) => (value === null ? null : Number(value.toFixed(2)));

// Golden numbers: ticket 33, recomputed from data/mock_logistics_data.csv.
describe("the warehouse scorecard (ticket 33)", () => {
  const { orders } = getDataset();
  const scorecard = warehouseScorecard(orders);

  it("scores the file's 9 warehouses, highest on-time rate first by default", () => {
    expect(
      scorecard.rows.map(({ warehouse, figures: f }) => [
        warehouse,
        f.orders,
        f.units,
        twoDecimals(f.grossValue),
        f.delivered,
        f.onTimeRate.numerator,
        `${f.onTimeRate.numerator}/${f.onTimeRate.denominator}`,
        twoDecimals(f.averageDeliveryDays.value),
      ]),
    ).toEqual([
      ["SFO-DC2", 46, 156, 1397.57, 44, 39, "39/44", 3.39],
      ["LAX-DC1", 46, 132, 1407.88, 44, 37, "37/44", 3.25],
      ["AMS-FC1", 43, 161, 1422.57, 40, 33, "33/40", 4.22],
      ["DFW-DC1", 42, 131, 1419.56, 39, 32, "32/39", 4.62],
      ["LON-FC1", 54, 172, 1725.45, 49, 40, "40/49", 3.71],
      // 26 of 32 each, 81.25%: the tie goes by name.
      ["BER-FC1", 38, 129, 1458.01, 32, 26, "26/32", 4.06],
      ["CHI-DC1", 36, 96, 1062.84, 32, 26, "26/32", 4.5],
      ["EWR-DC1", 49, 183, 2252.69, 46, 37, "37/46", 3.57],
      ["ATL-DC1", 46, 150, 1549.3, 44, 34, "34/44", 3.55],
    ]);
    expect(scorecard.rows.map(({ figures }) => percent(figures.onTimeRate.value))).toEqual([88.6, 84.1, 82.5, 82.1, 81.6, 81.3, 81.3, 80.4, 77.3]);
  });

  it("marks SFO-DC2 best on time at 88.6% and ATL-DC1 worst at 77.3%", () => {
    expect(scorecard.best).toEqual(["SFO-DC2"]);
    expect(scorecard.worst).toEqual(["ATL-DC1"]);
  });

  it("agrees with the query tool, which the Delivery page's warehouse bars use, on every warehouse's rates and time", () => {
    for (const metric of ["on_time_rate", "delay_rate", "average_delivery_time"] as const) {
      const result = runQuery(querySpecSchema.parse({ tool: "query", metric, groupBy: "warehouse" }), getDataset());
      if (result.kind !== "result") throw new Error(result.message);
      for (const { warehouse, figures } of scorecard.rows) {
        const row = result.rows.find(({ key }) => key === warehouse);
        const ratio = metric === "on_time_rate" ? figures.onTimeRate : metric === "delay_rate" ? figures.delayRate : figures.averageDeliveryDays;
        expect([row?.numerator, row?.denominator], `${metric} ${warehouse}`).toEqual([ratio.numerator, ratio.denominator]);
      }
    }
  });

  it("adds up every warehouse in its total: 400 orders, 370 delivered, 304 on time", () => {
    expect(scorecard.total).toMatchObject({ orders: 400, units: 1310, delivered: 370, onTimeRate: { numerator: 304, denominator: 370 } });
  });

  it("sorts by any column either way, ties by name, a warehouse with no rate last", () => {
    const byValue = warehouseScorecard(orders, { column: "gross_order_value", direction: "desc" });
    expect(byValue.rows[0]?.warehouse).toBe("EWR-DC1");
    expect(warehouseScorecard(orders, { column: "order_count", direction: "desc" }).rows[0]?.warehouse).toBe("LON-FC1");
    expect(warehouseScorecard(orders, { column: "order_count", direction: "asc" }).rows[0]?.warehouse).toBe("CHI-DC1");
    expect(warehouseScorecard(orders, { column: "warehouse", direction: "asc" }).rows.map(({ warehouse }) => warehouse)).toEqual([
      "AMS-FC1",
      "ATL-DC1",
      "BER-FC1",
      "CHI-DC1",
      "DFW-DC1",
      "EWR-DC1",
      "LAX-DC1",
      "LON-FC1",
      "SFO-DC2",
    ]);
    expect(warehouseScorecard(orders, { column: "average_delivery_time", direction: "desc" }).rows[0]?.warehouse).toBe("DFW-DC1");
    expect(warehouseScorecard(orders, { column: "delay_rate", direction: "desc" }).rows[0]?.warehouse).toBe("ATL-DC1");

    const open = [...deliveries("AAA-1", 1, 0), shipped("BBB-1", "in_transit")];
    for (const direction of ["asc", "desc"] as const) {
      expect(warehouseScorecard(open, { column: "on_time_rate", direction }).rows.map(({ warehouse }) => warehouse)).toEqual(["AAA-1", "BBB-1"]);
    }
  });

  it("names best and worst only among warehouses with at least 20 deliveries, and every warehouse tied there", () => {
    const small = warehouseScorecard([...deliveries("BIG-1", 18, 2), ...deliveries("BIG-2", 16, 4), ...deliveries("BIG-3", 16, 4), ...deliveries("TINY", 3, 0)]);
    expect(small.best).toEqual(["BIG-1"]);
    expect(small.worst).toEqual(["BIG-2", "BIG-3"]);
  });

  it("names none when fewer than two warehouses have 20 deliveries, or all of them score the same", () => {
    expect(warehouseScorecard([...deliveries("BIG-1", 18, 2), ...deliveries("TINY", 3, 0)])).toMatchObject({ best: [], worst: [] });
    expect(warehouseScorecard([...deliveries("BIG-1", 18, 2), ...deliveries("BIG-2", 18, 2)])).toMatchObject({ best: [], worst: [] });
  });
});

describe("the lanes, origin to destination (ticket 33)", () => {
  const { rows: lanes, smallSamples } = laneFigures(getDataset().orders);

  it("finds 47 lanes in the file, the busiest London → Leeds and Newark → Boston with 15 orders each", () => {
    expect(lanes).toHaveLength(47);
    expect(
      lanes.slice(0, 5).map(({ origin, destination, figures: f }) => [
        `${origin} → ${destination}`,
        f.orders,
        f.delivered,
        percent(f.onTimeRate.value),
        twoDecimals(f.averageDeliveryDays.value),
      ]),
    ).toEqual([
      ["London, UK → Leeds, UK", 15, 14, 78.6, 3.64],
      ["Newark, NJ → Boston, MA", 15, 14, 78.6, 3.36],
      ["Atlanta, GA → Orlando, FL", 13, 13, 76.9, 4.0],
      ["Berlin, DE → Zurich, CH", 13, 12, 91.7, 3.42],
      ["London, UK → Edinburgh, UK", 13, 11, 72.7, 4.36],
    ]);
  });

  it("flags every lane in the file as a small sample: none has 20 delivered orders", () => {
    expect(lanes.every(({ figures }) => figures.smallSample)).toBe(true);
    expect(smallSamples).toBe(47);
    expect(Math.max(...lanes.map(({ figures }) => figures.delivered))).toBe(14);
  });

  it("covers every order once", () => {
    expect(lanes.reduce((sum, { figures }) => sum + figures.orders, 0)).toBe(400);
  });

  it("sorts by orders, ties by origin, then destination", () => {
    const lane = (origin: string, destination: string) => shipped("LON-FC1", "delivered", { origin_city: origin, destination_city: destination });
    const { rows: sorted } = laneFigures([lane("London, UK", "York, UK"), lane("Berlin, DE", "Zurich, CH"), lane("London, UK", "Leeds, UK"), lane("London, UK", "Leeds, UK")]);
    expect(sorted.map(({ origin, destination }) => `${origin} → ${destination}`)).toEqual(["London, UK → Leeds, UK", "Berlin, DE → Zurich, CH", "London, UK → York, UK"]);
  });
});

describe("the clients (ticket 33)", () => {
  const clients = clientRows(getDataset().orders);

  it("finds 30 clients, CL-1004 first by gross value: 46 orders, USD 1,755.34, 76.7% on time (33 of 43)", () => {
    expect(clients).toHaveLength(30);
    expect(clients.slice(0, 5).map(({ client, figures: f }) => [client, f.orders, twoDecimals(f.grossValue), percent(f.onTimeRate.value)])).toEqual([
      ["CL-1004", 46, 1755.34, 76.7],
      ["CL-1005", 36, 1403.02, 84.8],
      ["CL-1002", 31, 1124.72, 71.4],
      ["CL-1003", 33, 1109.36, 86.2],
      ["CL-1001", 35, 1058.9, 87.1],
    ]);
    expect(clients[0]?.figures.onTimeRate).toMatchObject({ numerator: 33, denominator: 43 });
  });

  it("flags 25 of the 30 as small samples: only 5 clients have 20 delivered orders (ADR 0001)", () => {
    expect(clients.filter(({ figures }) => !figures.smallSample).map(({ client }) => client).sort()).toEqual(["CL-1001", "CL-1002", "CL-1003", "CL-1004", "CL-1005"]);
  });

  it("breaks a tie in value by client", () => {
    const tied = clientRows([shipped("LON-FC1", "delivered", { client_id: "CL-1009" }), shipped("LON-FC1", "delivered", { client_id: "CL-1002" })]);
    expect(tied.map(({ client }) => client)).toEqual(["CL-1002", "CL-1009"]);
  });
});
