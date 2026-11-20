import { describe, expect, it } from "vitest";
import {
  averageDeliveryDays,
  dashboardKpis,
  deliveredOrders,
  deliveryOutcomes,
  onTimeRate,
  ratio,
} from "./definitions";
import { getDataset, type Order } from "./orders";

function order(status: Order["status"], orderDate: string, deliveryDate: string | null): Order {
  return {
    client_id: "CL-1000",
    order_id: `ORD-${status}-${orderDate}`,
    order_date: orderDate,
    delivery_date: deliveryDate,
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
    warehouse: "LON-FC1",
  };
}

describe("dashboard KPIs on the dataset (ADR 0001, Reading B in docs/data.md)", () => {
  const kpis = dashboardKpis(getDataset().orders);

  it("counts 400 orders, 27 of them in transit and 3 canceled", () => {
    expect(kpis.totalOrders).toEqual({ count: 400, inTransit: 27, canceled: 3 });
  });

  it("counts 370 delivered orders: 304 on time, 55 delayed, 11 exception", () => {
    expect(kpis.deliveredOrders).toEqual({ count: 370, onTime: 304, delayed: 55, exception: 11 });
  });

  it("counts 55 delayed orders", () => {
    expect(kpis.delayedOrders).toBe(55);
  });

  it("has an on-time delivery rate of 304 / 370 = 82.16%", () => {
    expect(kpis.onTimeRate.numerator).toBe(304);
    expect(kpis.onTimeRate.denominator).toBe(370);
    expect((kpis.onTimeRate.value ?? Number.NaN) * 100).toBeCloseTo(82.16, 2);
  });

  it("has an average delivery time of 3.83 days over the 370 delivered orders", () => {
    expect(kpis.averageDeliveryDays.denominator).toBe(370);
    expect(kpis.averageDeliveryDays.value ?? Number.NaN).toBeCloseTo(3.83, 2);
  });
});

describe("delivery definitions (ADR 0001)", () => {
  const sample = [
    order("delivered", "2025-05-01", "2025-05-03"),
    order("delayed", "2025-05-01", "2025-05-08"),
    order("exception", "2025-05-01", "2025-05-11"),
    order("in_transit", "2025-05-01", null),
    order("canceled", "2025-05-01", null),
  ];

  it("counts an order as delivered when it has a delivery date, whatever its status", () => {
    expect(deliveredOrders(sample).map((delivered) => delivered.status)).toEqual(["delivered", "delayed", "exception"]);
  });

  it("counts an exception order as neither on time nor delayed", () => {
    expect(deliveryOutcomes(sample)).toEqual({ onTime: 1, delayed: 1, exception: 1 });
  });

  it("keeps in-transit and canceled orders out of the on-time rate and the delivery time", () => {
    expect(onTimeRate(sample)).toMatchObject({ numerator: 1, denominator: 3 });
    expect(averageDeliveryDays(sample)).toEqual({ numerator: 2 + 7 + 10, denominator: 3, value: 19 / 3 });
  });

  it("counts delivery time in whole calendar days, across a month end and a clock change", () => {
    // Europe moved its clocks forward on 30 Mar 2025; a local-time parse there would give 1.96 days.
    expect(averageDeliveryDays([order("delivered", "2025-03-29", "2025-03-31")]).value).toBe(2);
    expect(averageDeliveryDays([order("delivered", "2025-01-31", "2025-02-01")]).value).toBe(1);
  });
});

describe("zero denominators", () => {
  it("gives a ratio with no value instead of dividing by zero", () => {
    expect(ratio(5, 0)).toEqual({ numerator: 5, denominator: 0, value: null });
    expect(ratio(0, 4)).toEqual({ numerator: 0, denominator: 4, value: 0 });
  });

  it("gives no on-time rate and no delivery time when nothing was delivered", () => {
    const open = [order("in_transit", "2025-12-30", null)];
    expect(onTimeRate(open)).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(averageDeliveryDays(open)).toEqual({ numerator: 0, denominator: 0, value: null });
  });

  it("computes the dashboard KPIs for no orders at all", () => {
    expect(dashboardKpis([])).toEqual({
      totalOrders: { count: 0, inTransit: 0, canceled: 0 },
      deliveredOrders: { count: 0, onTime: 0, delayed: 0, exception: 0 },
      delayedOrders: 0,
      onTimeRate: { numerator: 0, denominator: 0, value: null },
      averageDeliveryDays: { numerator: 0, denominator: 0, value: null },
    });
  });
});
