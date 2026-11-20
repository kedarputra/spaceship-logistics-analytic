import { describe, expect, it } from "vitest";
import {
  averageDeliveryDays,
  dashboardKpis,
  delayRateByCarrier,
  deliveredOrders,
  deliveryOutcomes,
  deliveryOutcomesOverTime,
  onTimeRate,
  orderCountOverTime,
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

describe("order count over time, by order date (ADR 0002)", () => {
  const months = orderCountOverTime(getDataset().orders, { from: "2025-01-01", to: "2025-12-31" }, "month");

  it("counts 75 orders in January 2025, the spike in docs/data.md, and 18 to 46 in every other month", () => {
    // Counted from the CSV's order_date column with cut | uniq -c, independently of this code.
    expect(months.map((month) => [month.bucket.label, month.value])).toEqual([
      ["Jan 2025", 75],
      ["Feb 2025", 36],
      ["Mar 2025", 46],
      ["Apr 2025", 25],
      ["May 2025", 29],
      ["Jun 2025", 21],
      ["Jul 2025", 42],
      ["Aug 2025", 34],
      ["Sep 2025", 18],
      ["Oct 2025", 26],
      ["Nov 2025", 24],
      ["Dec 2025", 24],
    ]);
  });

  it("puts all 400 orders, in transit and canceled included, into the twelve months", () => {
    expect(months).toHaveLength(12);
    expect(months.reduce((sum, month) => sum + month.value, 0)).toBe(400);
  });
});

describe("delivery outcomes over time, by delivery date (ADR 0002)", () => {
  const { orders } = getDataset();
  const lastThreeMonths = { from: "2025-10-01", to: "2025-12-31" };

  it("counts 10 delayed orders over 14 weekly buckets in Oct–Dec 2025, 7 of them non-zero", () => {
    const weeks = deliveryOutcomesOverTime(orders, lastThreeMonths, "week");
    expect(weeks).toHaveLength(14);
    expect(weeks[0]?.bucket).toMatchObject({ label: "w/c 29 Sep", from: "2025-10-01", to: "2025-10-05", partial: true });
    expect(weeks.at(-1)?.bucket).toMatchObject({ label: "w/c 29 Dec", from: "2025-12-29", to: "2025-12-31", partial: true });
    expect(weeks.filter((week) => week.value.delayed > 0).map((week) => [week.bucket.label, week.value.delayed])).toEqual([
      ["w/c 6 Oct", 2],
      ["w/c 13 Oct", 1],
      ["w/c 3 Nov", 1],
      ["w/c 17 Nov", 2],
      ["w/c 1 Dec", 1],
      ["w/c 8 Dec", 1],
      ["w/c 15 Dec", 2],
    ]);
    expect(weeks.reduce((sum, week) => sum + week.value.delayed, 0)).toBe(10);
  });

  it("gives a week with no delayed delivery a 0, not a gap", () => {
    const weeks = deliveryOutcomesOverTime(orders, lastThreeMonths, "week");
    expect(weeks.find((week) => week.bucket.label === "w/c 20 Oct")?.value.delayed).toBe(0);
  });

  it("counts 3 delayed orders in November 2025 and 4 in December by delivery date", () => {
    const months = deliveryOutcomesOverTime(orders, lastThreeMonths, "month");
    expect(months.map((month) => [month.bucket.label, month.value.delayed])).toEqual([
      ["Oct 2025", 3],
      ["Nov 2025", 3],
      ["Dec 2025", 4],
    ]);
  });

  it("splits the 370 delivered orders of 2025 into 304 on time, 55 delayed and 11 exception across the months", () => {
    const months = deliveryOutcomesOverTime(orders, { from: "2025-01-01", to: "2025-12-31" }, "month");
    const total = (outcome: "onTime" | "delayed" | "exception") =>
      months.reduce((sum, month) => sum + month.value[outcome], 0);
    expect([total("onTime"), total("delayed"), total("exception")]).toEqual([304, 55, 11]);
  });
});

describe("delay rate by carrier (ADR 0001 §3, §6)", () => {
  const year2025 = { from: "2025-01-01", to: "2025-12-31" };
  const carriers = delayRateByCarrier(getDataset().orders, year2025);

  it("ranks the 9 carriers by delay rate: GLS 2/8, USPS 11/47, UPS 17/78, Royal Mail 5/25 first", () => {
    expect(carriers).toHaveLength(9);
    expect(carriers.slice(0, 4).map(({ carrier, rate }) => [carrier, rate.numerator, rate.denominator])).toEqual([
      ["GLS", 2, 8],
      ["USPS", 11, 47],
      ["UPS", 17, 78],
      ["Royal Mail", 5, 25],
    ]);
    expect((carriers[0]?.rate.value ?? Number.NaN) * 100).toBeCloseTo(25.0, 1);
    expect((carriers[1]?.rate.value ?? Number.NaN) * 100).toBeCloseTo(23.4, 1);
    const values = carriers.map(({ rate }) => rate.value ?? Number.NaN);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("flags GLS (8 delivered orders) and DPD (18) as small samples, and no other carrier", () => {
    expect(carriers.filter(({ smallSample }) => smallSample).map(({ carrier, rate }) => [carrier, rate.denominator])).toEqual([
      ["GLS", 8],
      ["DPD", 18],
    ]);
  });

  it("counts only the orders delivered inside the period, by delivery date (ADR 0002 §5)", () => {
    const sample = [
      order("delayed", "2025-04-28", "2025-05-02"),
      order("delivered", "2025-05-30", "2025-06-02"),
      order("delivered", "2025-04-20", "2025-04-25"),
    ];
    expect(delayRateByCarrier(sample, { from: "2025-05-01", to: "2025-05-31" })).toEqual([
      { carrier: "DHL", rate: { numerator: 1, denominator: 1, value: 1 }, smallSample: true },
    ]);
  });

  it("puts a carrier with no delivered orders last, with no rate", () => {
    const sample = [order("delayed", "2025-05-01", "2025-05-08"), { ...order("in_transit", "2025-05-02", null), carrier: "GLS" }];
    expect(delayRateByCarrier(sample, year2025)).toEqual([
      { carrier: "DHL", rate: { numerator: 1, denominator: 1, value: 1 }, smallSample: true },
      { carrier: "GLS", rate: { numerator: 0, denominator: 0, value: null }, smallSample: true },
    ]);
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
