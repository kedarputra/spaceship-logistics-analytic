import { describe, expect, it } from "vitest";
import { cents } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import { type MonthlyReport, monthlyReport } from "./report";
import { runQuery } from "./query";
import { querySpecSchema } from "./spec";

// Golden numbers: ticket 34, recomputed independently from data/mock_logistics_data.csv.
const dataset = getDataset();

function reportFor(month: string): MonthlyReport {
  const report = monthlyReport(dataset, month);
  if (report === undefined) throw new Error(`No report for ${month}`);
  return report;
}

const GOLDEN = [
  { month: "2025-10", placed: 26, units: 79, grossCents: 91202, completed: 22, onTime: 18, delayed: 3, exception: 1, averageDays: 3.3182, inTransit: 2 },
  { month: "2025-11", placed: 24, units: 113, grossCents: 160098, completed: 19, onTime: 16, delayed: 3, exception: 0, averageDays: 3.7368, inTransit: 4 },
  { month: "2025-12", placed: 24, units: 93, grossCents: 112032, completed: 26, onTime: 22, delayed: 4, exception: 0, averageDays: 3.3846, inTransit: 1 },
] as const;

describe("the monthly report (ticket 34)", () => {
  it.each(GOLDEN)("adds up $month: placed by order date, completed by delivery date, in transit by status", (golden) => {
    const { current } = reportFor(golden.month);
    expect(current.month).toBe(golden.month);
    expect(current.figures).toMatchObject({
      orders: golden.placed,
      units: golden.units,
      delivered: golden.completed,
      onTimeRate: { numerator: golden.onTime, denominator: golden.completed },
      delayRate: { numerator: golden.delayed, denominator: golden.completed },
    });
    expect(cents(current.figures.grossValue)).toBe(golden.grossCents);
    expect(current.figures.averageDeliveryDays.value ?? Number.NaN).toBeCloseTo(golden.averageDays, 4);
    expect(current.outcomes).toEqual({ onTime: golden.onTime, delayed: golden.delayed, exception: golden.exception });
    expect(current.outcomeRates).toMatchObject({
      onTime: { numerator: golden.onTime, denominator: golden.completed },
      delayed: { numerator: golden.delayed, denominator: golden.completed },
      exception: { numerator: golden.exception, denominator: golden.completed },
    });
    expect(current.attention.filter(({ order }) => order.status === "in_transit")).toHaveLength(golden.inTransit);
  });

  it("states each month's dates and the month before it", () => {
    const november = reportFor("2025-11");
    expect(november.current.period).toEqual({ from: "2025-11-01", to: "2025-11-30" });
    expect(november.previous?.month).toBe("2025-10");
    expect(november.previous?.period).toEqual({ from: "2025-10-01", to: "2025-10-31" });
    expect(november.anchor).toBe("2025-12-31");
  });

  it("compares Nov with Oct: −2 orders, +34 units, +USD 688.96, −3 completed, on-time rate +2.4 points", () => {
    const { changes } = reportFor("2025-11");
    expect(changes).toMatchObject({ orders: -2, units: 34, grossValue: 688.96, delivered: -3 });
    expect(changes?.onTimeRate ?? Number.NaN).toBeCloseTo(2.3923, 4);
    expect(changes?.delayRate ?? Number.NaN).toBeCloseTo(15.7895 - 13.6364, 3);
    expect(changes?.averageDeliveryDays ?? Number.NaN).toBeCloseTo(3.7368 - 3.3182, 3);
  });

  it("compares Dec with Nov: on-time rate +0.4 points (84.6% against 84.2%)", () => {
    expect(reportFor("2025-12").changes?.onTimeRate ?? Number.NaN).toBeCloseTo(0.4049, 4);
  });

  it("has no month before the first month of the data, so nothing to compare", () => {
    const january = reportFor("2025-01");
    expect(january.previous).toBeNull();
    expect(january.changes).toBeNull();
    expect(january.current.figures.orders).toBe(75);
  });

  it("lists Nov's carriers by deliveries completed, most first and ties by name, every one a small sample", () => {
    const rows = reportFor("2025-11").current.carriers.map(({ carrier, figures }) => [
      carrier,
      figures.delivered,
      figures.onTimeRate.numerator,
      figures.delayRate.numerator,
      figures.smallSample,
    ]);
    expect(rows).toEqual([
      ["USPS", 5, 3, 2, true],
      ["FedEx", 4, 4, 0, true],
      ["UPS", 4, 3, 1, true],
      ["Royal Mail", 2, 2, 0, true],
      ["DPD", 1, 1, 0, true],
      ["GLS", 1, 1, 0, true],
      ["LaserShip", 1, 1, 0, true],
      ["OnTrac", 1, 1, 0, true],
    ]);
  });

  it("splits Nov's deliveries by week of delivery, Monday to Sunday, the first week clipped to 1–2 Nov", () => {
    const weeks = reportFor("2025-11").current.weeks.map(({ bucket, value, delivered }) => [bucket.label, bucket.from, bucket.to, bucket.partial, value.onTime, value.delayed, value.exception, delivered]);
    expect(weeks).toEqual([
      ["w/c 27 Oct", "2025-11-01", "2025-11-02", true, 1, 0, 0, 1],
      ["w/c 3 Nov", "2025-11-03", "2025-11-09", false, 3, 1, 0, 4],
      ["w/c 10 Nov", "2025-11-10", "2025-11-16", false, 3, 0, 0, 3],
      ["w/c 17 Nov", "2025-11-17", "2025-11-23", false, 6, 2, 0, 8],
      ["w/c 24 Nov", "2025-11-24", "2025-11-30", false, 3, 0, 0, 3],
    ]);
  });

  it("scores Nov's warehouses as Network does, orders placed in Nov and deliveries completed in it", () => {
    const { rows, total } = reportFor("2025-11").current.warehouses;
    const row = (warehouse: string) => rows.find((each) => each.warehouse === warehouse)?.figures;
    expect(rows).toHaveLength(9);
    expect(row("EWR-DC1")).toMatchObject({ orders: 8, units: 45, delivered: 7, onTimeRate: { numerator: 7, denominator: 7 } });
    expect(cents(row("EWR-DC1")?.grossValue ?? 0)).toBe(83357);
    expect(row("ATL-DC1")).toMatchObject({ orders: 4, delivered: 4, onTimeRate: { numerator: 2 }, delayRate: { numerator: 2 } });
    // Delivered in Nov, placed earlier; and placed in Nov, nothing delivered yet.
    expect(row("SFO-DC2")).toMatchObject({ orders: 0, delivered: 1 });
    expect(row("AMS-FC1")).toMatchObject({ orders: 2, delivered: 0, onTimeRate: { value: null } });
    // Highest on-time rate first, as on Network; no rate last.
    expect(rows.at(-1)?.warehouse).toBe("AMS-FC1");
    expect(total).toMatchObject({ orders: 24, delivered: 19 });
    // No warehouse has 20 deliveries in a month, so none is marked best or worst.
    expect([...reportFor("2025-11").current.warehouses.best, ...reportFor("2025-11").current.warehouses.worst]).toEqual([]);
  });

  it("ranks Nov's categories and SKUs by gross value: PAINT 406.92, MARKER 285.69, PAPER 272.44; PAINT-0037 first", () => {
    const { topCategories: categories, topSkus: skus } = reportFor("2025-11").current;
    expect(categories).toHaveLength(5);
    expect(skus).toHaveLength(5);
    expect(categories.slice(0, 3).map(({ category, figures }) => [category, cents(figures.grossValue)])).toEqual([
      ["PAINT", 40692],
      ["MARKER", 28569],
      ["PAPER", 27244],
    ]);
    expect(skus.slice(0, 2).map(({ sku, grossValue }) => [sku, cents(grossValue)])).toEqual([
      ["PAINT-0037", 29887],
      ["MARKER-0138", 19296],
    ]);
  });

  it("lists the orders placed in Nov still in transit on the anchor date, oldest first, with their days in transit", () => {
    const rows = reportFor("2025-11").current.attention.map(({ order, transitAge }) => [order.order_id, order.status, transitAge]);
    expect(rows).toEqual([
      ["ORD-2026-542610-0082", "in_transit", 58],
      ["ORD-2026-571946-0024", "in_transit", 48],
      ["ORD-2026-108980-0325", "in_transit", 42],
      ["ORD-2026-682573-0181", "in_transit", 40],
    ]);
  });

  it("lists canceled orders placed in the month too: Mar 2025 has one, between three in transit", () => {
    const rows = reportFor("2025-03").current.attention.map(({ order }) => [order.order_id, order.status]);
    expect(rows).toEqual([
      ["ORD-2026-412179-0256", "in_transit"],
      ["ORD-2026-975697-0193", "canceled"],
      ["ORD-2026-214632-0378", "in_transit"],
      ["ORD-2026-325051-0369", "in_transit"],
    ]);
  });

  it("counts the same delayed orders as the Ask answer to “How many orders were delivered late last month?”: 3", () => {
    const answer = runQuery(querySpecSchema.parse({ tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" } }), dataset);
    if (answer.kind !== "result") throw new Error(answer.message);
    expect(answer.rows[0]?.value).toBe(3);
    expect(reportFor("2025-11").current.outcomes.delayed).toBe(3);
  });

  it.each(["2024-12", "2026-01", "2025-13", "2025-00", "2025-1", "nov", "", "2025-11.pdf"])("has no report for %j, outside the data or not a month", (month) => {
    expect(monthlyReport(dataset, month)).toBeUndefined();
  });
});
