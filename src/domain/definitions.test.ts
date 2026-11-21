import { describe, expect, it } from "vitest";
import {
  abcClasses,
  averageDeliveryDays,
  cents,
  change,
  dashboardKpis,
  deliveredOrders,
  deliveredOrdersOverTime,
  deliveryOutcomes,
  deliveryOutcomesOverTime,
  exceptionRate,
  groupFigures,
  grossOrderValue,
  isRateOrAverage,
  longestCompletedDelivery,
  type MetricDefinition,
  METRIC_STATUSES,
  METRICS,
  mostOrdersOfOneSku,
  type MetricId,
  onTimeRate,
  orderCountOverTime,
  ordersDatedIn,
  overdueInTransit,
  periodFigures,
  pointsChange,
  ratio,
  shareOfValue,
  transitAge,
  transitAgeBuckets,
  valueChange,
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

  it("counts 400 orders, 27 of them in transit and 3 canceled: 30 not delivered", () => {
    expect(kpis.totalOrders).toEqual({ count: 400, inTransit: 27, canceled: 3, notDelivered: 30 });
  });

  it("counts 370 delivered orders: 304 on time, 55 delayed, 11 exception", () => {
    expect(kpis.deliveredOrders).toEqual({ count: 370, onTime: 304, delayed: 55, exception: 11 });
  });

  it("counts 55 delayed orders, a delay rate of 55 / 370 = 14.86%", () => {
    expect(kpis.delayedOrders.count).toBe(55);
    expect(kpis.delayedOrders.delayRate.numerator).toBe(55);
    expect(kpis.delayedOrders.delayRate.denominator).toBe(370);
    expect((kpis.delayedOrders.delayRate.value ?? Number.NaN) * 100).toBeCloseTo(14.86, 2);
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

describe("the 11 metrics of ADR 0006 §1 on the dataset (golden numbers in docs/data.md)", () => {
  const { orders } = getDataset();
  const count = (id: MetricId) => {
    const metric = METRICS[id];
    if (metric.kind === "rate" || metric.kind === "average") throw new Error(`${id} is not a count`);
    return metric.compute(orders);
  };
  const ratioOf = (id: MetricId) => {
    const metric = METRICS[id];
    if (metric.kind !== "rate" && metric.kind !== "average") throw new Error(`${id} is not a ratio`);
    return metric.compute(orders);
  };

  it("counts 400 orders, 370 delivered, 304 on time, 55 delayed, 11 exception", () => {
    const counts: MetricId[] = ["order_count", "delivered_orders", "on_time_deliveries", "delayed_orders", "exception_orders"];
    expect(counts.map(count)).toEqual([400, 370, 304, 55, 11]);
  });

  it("has an on-time rate of 304 / 370 (82.16%) and a delay rate of 55 / 370", () => {
    expect(ratioOf("on_time_rate")).toMatchObject({ numerator: 304, denominator: 370 });
    expect((ratioOf("on_time_rate").value ?? Number.NaN) * 100).toBeCloseTo(82.16, 2);
    expect(ratioOf("delay_rate")).toMatchObject({ numerator: 55, denominator: 370 });
  });

  it("has an average delivery time of 3.83 days", () => {
    expect(ratioOf("average_delivery_time").value ?? Number.NaN).toBeCloseTo(3.83, 2);
  });

  it("sums 1,310 units, USD 13,695.87 gross order value, and USD 13,568.01 net after promo discounts", () => {
    expect(count("units")).toBe(1310);
    expect(count("gross_order_value")).toBeCloseTo(13695.87, 2);
    expect(count("net_order_value")).toBeCloseTo(13568.01, 2);
  });

  it("dates order volume and value by order_date and every delivery outcome by delivery_date (ADR 0002 §5)", () => {
    const byDateField = (field: string) =>
      Object.entries(METRICS)
        .filter(([, metric]) => metric.dateField === field)
        .map(([id]) => id)
        .sort();
    expect(byDateField("order_date")).toEqual(["gross_order_value", "net_order_value", "order_count", "units"]);
    expect(byDateField("delivery_date")).toEqual([
      "average_delivery_time",
      "delay_rate",
      "delayed_orders",
      "delivered_orders",
      "exception_orders",
      "on_time_deliveries",
      "on_time_rate",
    ]);
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
      totalOrders: { count: 0, inTransit: 0, canceled: 0, notDelivered: 0 },
      deliveredOrders: { count: 0, onTime: 0, delayed: 0, exception: 0 },
      delayedOrders: { count: 0, delayRate: { numerator: 0, denominator: 0, value: null } },
      onTimeRate: { numerator: 0, denominator: 0, value: null },
      averageDeliveryDays: { numerator: 0, denominator: 0, value: null },
    });
  });
});

describe("figures the Delivery and Forecast pages show (ticket 25, docs/design/README.md)", () => {
  const { orders } = getDataset();

  it("counts exception orders as a share of delivered orders: 11 of 370, 2.97%", () => {
    const share = exceptionRate(orders);
    expect([share.numerator, share.denominator]).toEqual([11, 370]);
    expect((share.value ?? Number.NaN) * 100).toBeCloseTo(2.97, 2);
    expect(exceptionRate([]).value).toBeNull();
  });

  it("finds that no SKU has more than 3 orders, the reason no SKU is forecast (ADR 0003 §9)", () => {
    expect(mostOrdersOfOneSku(orders)).toBe(3);
    expect(mostOrdersOfOneSku([])).toBe(0);
  });
});

describe("the statuses each metric is computed over (ticket 29, golden numbers in docs/data.md)", () => {
  const { orders } = getDataset();
  const ids = (picked: readonly Order[]) => picked.map((picked) => picked.order_id);
  const withStatus = (statuses: readonly Order["status"][] | undefined) => orders.filter((order) => statuses === undefined || statuses.includes(order.status));

  /** The orders a metric is computed over: what a count counts, a rate's or an average's delivered orders, or every order. */
  function computedOver(metric: MetricDefinition): readonly Order[] {
    if (metric.kind === "count") return metric.matching(orders);
    if (isRateOrAverage(metric.kind)) return deliveredOrders(orders);
    return orders;
  }

  it("names the 370 delivered orders, those with a delivery date, by their statuses: delivered, delayed, exception", () => {
    expect(ids(withStatus(METRIC_STATUSES.delivered_orders))).toEqual(ids(deliveredOrders(orders)));
    expect(withStatus(METRIC_STATUSES.delivered_orders)).toHaveLength(370);
  });

  it("picks exactly the orders each metric is computed over: 400, 370, 304, 55 or 11", () => {
    const expected: [MetricId, number][] = [
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
    ];
    expect(expected.map(([id]) => id).sort()).toEqual(Object.keys(METRICS).sort());
    for (const [id, count] of expected) {
      expect(ids(withStatus(METRIC_STATUSES[id])), id).toEqual(ids(computedOver(METRICS[id])));
      expect(withStatus(METRIC_STATUSES[id]), id).toHaveLength(count);
    }
    expect(ids(withStatus(METRIC_STATUSES.delivery_outcomes))).toEqual(ids(deliveredOrders(orders)));
    expect(withStatus(METRIC_STATUSES.order_share)).toHaveLength(400);
  });
});

// Ticket 32: what the Needs attention worklist is built on. Golden numbers recomputed from the CSV.
describe("orders in transit and how old they are (ticket 32)", () => {
  const { orders, anchor } = getDataset();

  it("ages an order in transit from its order date to the anchor date, in days, and gives any other order no age", () => {
    expect(transitAge(order("in_transit", "2025-12-23", null), "2025-12-31")).toBe(8);
    expect(transitAge(order("in_transit", "2025-12-31", null), "2025-12-31")).toBe(0);
    expect(transitAge(order("delivered", "2025-12-23", "2025-12-26"), "2025-12-31")).toBeNull();
    expect(transitAge(order("canceled", "2025-03-07", null), "2025-12-31")).toBeNull();
  });

  it("finds the oldest orders in transit in the file 362 days old, and the youngest 8", () => {
    const ages = orders.map((each) => transitAge(each, anchor)).filter((age) => age !== null);
    expect(ages).toHaveLength(27);
    expect(Math.max(...ages)).toBe(362);
    expect(Math.min(...ages)).toBe(8);
  });
});

describe("the longest completed delivery (ticket 32)", () => {
  it("is 12 days in the file: the slowest of the 370 delivered orders, an exception order", () => {
    expect(longestCompletedDelivery(getDataset().orders)).toBe(12);
  });

  it("comes from the orders given, over delivered orders only, so another file gets its own", () => {
    const orders = [
      order("delivered", "2025-03-01", "2025-03-04"),
      order("delayed", "2025-03-01", "2025-03-21"),
      order("in_transit", "2025-01-01", null),
      order("canceled", "2025-01-01", null),
    ];
    expect(longestCompletedDelivery(orders)).toBe(20);
  });

  it("is none when nothing has been delivered", () => {
    expect(longestCompletedDelivery([order("in_transit", "2025-01-01", null)])).toBeNull();
    expect(longestCompletedDelivery([])).toBeNull();
  });
});

describe("overdue in transit (ticket 32)", () => {
  const ids = (list: readonly Order[]) => list.map((each) => each.order_id);

  it("finds 26 of the 27 orders in transit older than the longest completed delivery, 12 days; the one left is 8 days old", () => {
    const { orders, anchor } = getDataset();
    const overdue = overdueInTransit(orders, anchor);
    expect(overdue).toHaveLength(26);
    expect(overdue.every((each) => each.status === "in_transit")).toBe(true);
    const within = orders.filter((each) => each.status === "in_transit" && !overdue.includes(each));
    expect(ids(within)).toEqual(["ORD-2026-328876-0262"]);
  });

  it("counts an order as overdue only past the threshold: 12 days is not, 13 is", () => {
    const slowest = order("exception", "2025-06-01", "2025-06-13");
    const twelve = { ...order("in_transit", "2025-12-19", null), order_id: "twelve" };
    const thirteen = { ...order("in_transit", "2025-12-18", null), order_id: "thirteen" };
    expect(ids(overdueInTransit([slowest, twelve, thirteen], "2025-12-31"))).toEqual(["thirteen"]);
  });

  it("finds none overdue when nothing has been delivered, as there is no delivery to compare with", () => {
    expect(overdueInTransit([order("in_transit", "2025-01-01", null)], "2025-12-31")).toEqual([]);
  });
});

describe("transit age buckets (ticket 32)", () => {
  it("counts the 27 orders in transit as 0–7: 0, 8–14: 1, 15–30: 0, 31+: 26", () => {
    const { orders, anchor } = getDataset();
    expect(transitAgeBuckets(orders, anchor)).toEqual([
      { label: "0–7", count: 0 },
      { label: "8–14", count: 1 },
      { label: "15–30", count: 0 },
      { label: "31+", count: 26 },
    ]);
  });

  it("puts each edge in its bucket, and leaves out orders not in transit", () => {
    const daysOld = (days: number) => order("in_transit", new Date(Date.UTC(2025, 11, 31 - days)).toISOString().slice(0, 10), null);
    const orders = [0, 7, 8, 14, 15, 30, 31, 300].map(daysOld);
    orders.push(order("delivered", "2025-01-01", "2025-01-03"), order("canceled", "2025-01-01", null));
    expect(transitAgeBuckets(orders, "2025-12-31").map(({ count }) => count)).toEqual([2, 2, 2, 2]);
  });
});

// Ticket 33: the ABC classification of SKUs by gross value. Golden numbers recomputed from the CSV.
describe("ABC classes of SKUs by gross value (ticket 33)", () => {
  /** One order of `sku` worth `value`, `units` units. */
  const sold = (sku: string, value: number, units = 1): Order => ({ ...order("delivered", "2025-05-01", "2025-05-03"), sku, order_value_usd: value, quantity: units });

  it("ranks SKUs by gross value, highest first, summing their orders", () => {
    const ranked = abcClasses([sold("PAPER-0002", 10, 2), sold("PAPER-0001", 30, 1), sold("PAPER-0002", 25, 3)]);
    expect(ranked.map(({ sku, orders, units, grossValue }) => [sku, orders, units, grossValue])).toEqual([
      ["PAPER-0002", 2, 5, 35],
      ["PAPER-0001", 1, 1, 30],
    ]);
    expect(ranked.map(({ rank }) => rank)).toEqual([1, 2]);
  });

  it("breaks a tie in value by SKU, ascending", () => {
    const ranked = abcClasses([sold("PAPER-0009", 20), sold("PAPER-0003", 20), sold("PAPER-0005", 20)]);
    expect(ranked.map(({ sku }) => sku)).toEqual(["PAPER-0003", "PAPER-0005", "PAPER-0009"]);
  });

  it("compares values to the cent, so the order they were summed in never breaks a tie", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    const ranked = abcClasses([sold("PAPER-0002", 0.1), sold("PAPER-0002", 0.2), sold("PAPER-0001", 0.3)]);
    expect(ranked.map(({ sku }) => sku)).toEqual(["PAPER-0001", "PAPER-0002"]);
  });

  it("makes a SKU A while the share of value before it is under 80%, B under 95%, and C after: a share of exactly 80% or 95% moves on", () => {
    const ranked = abcClasses([sold("A-1", 50), sold("A-2", 30), sold("B-1", 15), sold("C-1", 5)]);
    expect(ranked.map(({ sku, abcClass, shareBefore }) => [sku, abcClass, shareBefore])).toEqual([
      ["A-1", "A", 0],
      ["A-2", "A", 0.5],
      ["B-1", "B", 0.8],
      ["C-1", "C", 0.95],
    ]);
    expect(ranked.map(({ cumulativeShare }) => cumulativeShare)).toEqual([0.5, 0.8, 0.95, 1]);
  });

  it("keeps a SKU just under a limit in the class before it", () => {
    const ranked = abcClasses([sold("A-1", 79.99), sold("A-2", 15), sold("B-1", 5.01)]);
    expect(ranked.map(({ abcClass }) => abcClass)).toEqual(["A", "A", "B"]);
  });

  it("classifies nothing when there are no orders", () => {
    expect(abcClasses([])).toEqual([]);
  });

  it("classifies the file's 355 SKUs, USD 13,695.87: A 174, B 103, C 78", () => {
    const ranked = abcClasses(getDataset().orders);
    expect(ranked).toHaveLength(355);
    const count = (abcClass: string) => ranked.filter((sku) => sku.abcClass === abcClass).length;
    expect([count("A"), count("B"), count("C")]).toEqual([174, 103, 78]);
    expect(ranked.at(-1)?.cumulativeShare).toBeCloseTo(1, 12);
    // The 174th SKU starts under 80% of the value, the 175th at or past it.
    expect(ranked[173]?.shareBefore).toBeLessThan(0.8);
    expect(ranked[174]?.shareBefore).toBeGreaterThanOrEqual(0.8);
  });

  it("ranks MARKER-0138 first at USD 345.49, then PAINT-0037, MARKER-0047, PAPER-0041 and PAPER-0075", () => {
    const top = abcClasses(getDataset().orders).slice(0, 5);
    expect(top.map(({ sku, grossValue }) => [sku, Number(grossValue.toFixed(2))])).toEqual([
      ["MARKER-0138", 345.49],
      ["PAINT-0037", 298.87],
      ["MARKER-0047", 204.76],
      ["PAPER-0041", 193.77],
      ["PAPER-0075", 177.42],
    ]);
    expect(top[0]).toMatchObject({ category: "MARKER", orders: 2, units: 16, abcClass: "A" });
  });
});

describe("what a group of orders adds up to: a warehouse, a lane, a client or a category (ticket 33)", () => {
  const worth = (status: Order["status"], deliveryDate: string | null, value: number, units: number): Order => ({
    ...order(status, "2025-05-01", deliveryDate),
    order_value_usd: value,
    quantity: units,
  });
  const group = [
    worth("delivered", "2025-05-03", 10, 1),
    worth("delayed", "2025-05-08", 20, 2),
    worth("exception", "2025-05-11", 30, 3),
    worth("in_transit", null, 40, 4),
    worth("canceled", null, 50, 5),
  ];

  it("counts every order, unit and dollar of gross value, and rates the delivered ones over delivered orders", () => {
    expect(groupFigures(group)).toEqual({
      orders: 5,
      units: 15,
      grossValue: 150,
      delivered: 3,
      onTimeRate: { numerator: 1, denominator: 3, value: 1 / 3 },
      delayRate: { numerator: 1, denominator: 3, value: 1 / 3 },
      averageDeliveryDays: { numerator: 2 + 7 + 10, denominator: 3, value: 19 / 3 },
      smallSample: true,
    });
  });

  it("is a small sample under 20 delivered orders, and not at 20", () => {
    const delivered = (count: number) => Array.from({ length: count }, () => worth("delivered", "2025-05-03", 1, 1));
    expect(groupFigures(delivered(19)).smallSample).toBe(true);
    expect(groupFigures([...delivered(19), worth("in_transit", null, 1, 1)]).smallSample).toBe(true);
    expect(groupFigures(delivered(20)).smallSample).toBe(false);
  });

  it("has no rates for a group with nothing delivered", () => {
    expect(groupFigures([worth("in_transit", null, 40, 4)])).toMatchObject({
      delivered: 0,
      onTimeRate: { value: null },
      averageDeliveryDays: { value: null },
      smallSample: true,
    });
  });

  it("gives a group's share of all gross value: PAINT is USD 2,288.10 of 13,695.87, 16.7%", () => {
    const { orders } = getDataset();
    const share = shareOfValue(
      orders.filter((each) => each.product_category === "PAINT"),
      orders,
    );
    expect(share.numerator).toBeCloseTo(2288.1, 2);
    expect(share.denominator).toBeCloseTo(13695.87, 2);
    expect((share.value ?? Number.NaN) * 100).toBeCloseTo(16.71, 2);
    expect(shareOfValue([], []).value).toBeNull();
  });

  it("adds up the file's EWR-DC1 orders: 49 orders, 183 units, USD 2,252.69, 46 delivered, 37 on time, 3.57 days", () => {
    const ewr = groupFigures(getDataset().orders.filter((each) => each.warehouse === "EWR-DC1"));
    expect(ewr).toMatchObject({ orders: 49, units: 183, delivered: 46, onTimeRate: { numerator: 37, denominator: 46 }, smallSample: false });
    expect(ewr.grossValue).toBeCloseTo(2252.69, 2);
    expect(ewr.averageDeliveryDays.value ?? Number.NaN).toBeCloseTo(3.57, 2);
  });
});

describe("a month and the month before (ticket 34)", () => {
  const { orders } = getDataset();
  const november = { from: "2025-11-01", to: "2025-11-30" };
  const october = { from: "2025-10-01", to: "2025-10-31" };

  it("dates each order by its own field: 24 placed in Nov 2025 by order date, 19 delivered by delivery date", () => {
    expect(ordersDatedIn(orders, november, "order_date")).toHaveLength(24);
    expect(ordersDatedIn(orders, november, "delivery_date")).toHaveLength(19);
    // An order not delivered has no delivery date, so no period by delivery date holds it.
    expect(ordersDatedIn([order("in_transit", "2025-11-03", null)], november, "delivery_date")).toEqual([]);
  });

  it("adds up a period with each figure on its own date (ADR 0002 §5): orders, units and value placed, rates delivered", () => {
    const figures = periodFigures(ordersDatedIn(orders, november, "order_date"), ordersDatedIn(orders, november, "delivery_date"));
    expect(figures).toMatchObject({ orders: 24, units: 113, delivered: 19, onTimeRate: { numerator: 16, denominator: 19 }, delayRate: { numerator: 3, denominator: 19 }, smallSample: true });
    expect(cents(figures.grossValue)).toBe(160098);
    expect(figures.averageDeliveryDays.value ?? Number.NaN).toBeCloseTo(3.7368, 4);
    // Over all the data both sets are every order, and it is groupFigures.
    expect(periodFigures(orders, orders)).toEqual(groupFigures(orders));
  });

  it("gives how far a figure moved: Nov's 24 orders placed against Oct's 26 is −2, and nothing to compare is no change", () => {
    expect(change(24, 26)).toBe(-2);
    expect(change(113, 79)).toBe(34);
    expect(change(null, 26)).toBeNull();
    expect(change(24, null)).toBeNull();
  });

  it("gives a rate's move in percentage points: Nov's on-time rate is +2.39 against Oct's (16 of 19 against 18 of 22)", () => {
    expect(pointsChange(ratio(16, 19), ratio(18, 22)) ?? Number.NaN).toBeCloseTo(2.3923, 4);
    expect(pointsChange(ratio(22, 26), ratio(16, 19)) ?? Number.NaN).toBeCloseTo(0.4049, 4);
    expect(pointsChange(ratio(3, 19), ratio(0, 0))).toBeNull();
  });

  it("counts the deliveries completed in each week of Nov 2025, by delivery date: 1, 4, 3, 8 and 3", () => {
    const weeks = deliveredOrdersOverTime(orders, november, "week");
    expect(weeks.map(({ bucket, value }) => [bucket.label, value])).toEqual([
      ["w/c 27 Oct", 1],
      ["w/c 3 Nov", 4],
      ["w/c 10 Nov", 3],
      ["w/c 17 Nov", 8],
      ["w/c 24 Nov", 3],
    ]);
    // An order not delivered has no week of delivery.
    expect(deliveredOrdersOverTime([order("in_transit", "2025-11-03", null)], november, "week").every(({ value }) => value === 0)).toBe(true);
  });

  it("gives a gross value's move to the cent: USD 1,600.98 against 912.02 is exactly 688.96", () => {
    const placed = (period: typeof november) => grossOrderValue(ordersDatedIn(orders, period, "order_date"));
    expect(valueChange(placed(november), placed(october))).toBe(688.96);
    expect(valueChange(0.1 + 0.2, 0.3)).toBe(0);
  });
});
