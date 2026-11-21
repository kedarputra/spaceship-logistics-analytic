import { describe, expect, it } from "vitest";
import { getDataset, type Order } from "@/domain/orders";
import { type AttentionSection, needsAttention } from "./attention";

// Golden numbers: ticket 32, recomputed from data/mock_logistics_data.csv, and docs/design/README.md.
const worklist = needsAttention(getDataset());

function section(id: AttentionSection["id"]): AttentionSection {
  const found = worklist.sections.find((each) => each.id === id);
  if (found === undefined) throw new Error(`No section ${id}`);
  return found;
}

const ids = (section: AttentionSection) => section.rows.map(({ order }) => order.order_id);
const byCarrier = (section: AttentionSection) => section.byCarrier.map(({ carrier, count }) => `${carrier} ${count}`);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? Number.NaN) : ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2;
}

describe("the Needs attention worklist (ticket 32)", () => {
  it("has four sections, each the orders of one status: overdue in transit 26, exceptions 11, delayed 55, canceled 3", () => {
    expect(worklist.sections.map(({ id, status, rows }) => [id, status, rows.length])).toEqual([
      ["overdue", "in_transit", 26],
      ["exceptions", "exception", 11],
      ["delayed", "delayed", 55],
      ["canceled", "canceled", 3],
    ]);
  });

  it("puts the oldest first: two DHL orders 362 days in transit, from SFO-DC2 and LON-FC1, in file order", () => {
    const [first, second, third] = section("overdue").rows;
    expect([first, second].map((row) => [row?.order.order_id, row?.order.carrier, row?.order.warehouse, row?.transitAge])).toEqual([
      ["ORD-2026-182650-0096", "DHL", "SFO-DC2", 362],
      ["ORD-2026-616202-0285", "DHL", "LON-FC1", 362],
    ]);
    expect([third?.order.order_id, third?.order.carrier, third?.order.warehouse, third?.transitAge]).toEqual(["ORD-2026-807844-0076", "UPS", "BER-FC1", 355]);
    for (const { rows } of worklist.sections) {
      const dates = rows.map(({ order }) => order.order_date);
      expect(dates).toEqual([...dates].sort());
    }
  });

  it("measures the threshold from the data: the longest completed delivery, 12 days, and 1 more in transit within it", () => {
    expect(worklist.longestCompletedDelivery).toBe(12);
    expect(worklist.inTransit).toBe(27);
    expect(worklist.withinThreshold.map(({ order, transitAge }) => [order.order_id, order.carrier, transitAge])).toEqual([["ORD-2026-328876-0262", "UPS", 8]]);
    expect(section("overdue").rows.every(({ transitAge }) => transitAge !== null && transitAge > 12)).toBe(true);
  });

  it("ages the 27 orders in transit with a median of 223 days", () => {
    const ages = [...section("overdue").rows, ...worklist.withinThreshold].map(({ transitAge }) => transitAge ?? Number.NaN);
    expect(median(ages)).toBe(223);
  });

  it("buckets the orders in transit by age: 0–7: 0, 8–14: 1, 15–30: 0, 31+: 26", () => {
    expect(worklist.buckets.map(({ label, count }) => `${label}: ${count}`)).toEqual(["0–7: 0", "8–14: 1", "15–30: 0", "31+: 26"]);
  });

  it("counts each section per carrier, most first and ties by name, so a reader sees whom to call", () => {
    expect(byCarrier(section("overdue"))).toEqual(["UPS 7", "DHL 5", "FedEx 4", "DPD 2", "LaserShip 2", "OnTrac 2", "USPS 2", "GLS 1", "Royal Mail 1"]);
    expect(byCarrier(section("exceptions"))).toEqual(["DPD 2", "OnTrac 2", "UPS 2", "DHL 1", "FedEx 1", "GLS 1", "Royal Mail 1", "USPS 1"]);
    expect(byCarrier(section("delayed"))).toEqual(["UPS 17", "FedEx 11", "USPS 11", "Royal Mail 5", "OnTrac 4", "DHL 3", "GLS 2", "LaserShip 2"]);
    expect(byCarrier(section("canceled"))).toEqual(["UPS 2", "LaserShip 1"]);
    for (const each of worklist.sections) expect(each.byCarrier.reduce((sum, { count }) => sum + count, 0)).toBe(each.rows.length);
  });

  it("lists the three canceled orders, oldest first", () => {
    expect(ids(section("canceled"))).toEqual(["ORD-2026-975697-0193", "ORD-2026-774620-0268", "ORD-2026-375289-0272"]);
  });

  it("gives an order in transit its age and a delivered order its delivery days, never both", () => {
    expect(section("overdue").rows.every(({ transitAge, deliveryDays }) => transitAge !== null && deliveryDays === null)).toBe(true);
    for (const id of ["exceptions", "delayed"] as const) {
      expect(section(id).rows.every(({ transitAge, deliveryDays }) => transitAge === null && deliveryDays !== null)).toBe(true);
    }
    expect(Math.max(...section("exceptions").rows.map(({ deliveryDays }) => deliveryDays ?? 0))).toBe(12);
    expect(section("canceled").rows.every(({ transitAge, deliveryDays }) => transitAge === null && deliveryDays === null)).toBe(true);
  });

  it("links each section to as many orders as Raw data opens for its status: every order in transit for the overdue, as Raw data has no age filter", () => {
    expect(worklist.sections.map(({ id, linkedOrderCount }) => [id, linkedOrderCount])).toEqual([
      ["overdue", 27],
      ["exceptions", 11],
      ["delayed", 55],
      ["canceled", 3],
    ]);
  });
});

describe("the worklist on other data", () => {
  const order = (id: string, status: Order["status"], orderDate: string, deliveryDate: string | null): Order => ({
    client_id: "CL-1000",
    order_id: id,
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
  });

  it("has empty sections when nothing needs attention", () => {
    const orders = [order("a", "delivered", "2025-03-01", "2025-03-03"), order("b", "in_transit", "2025-03-02", null)];
    const quiet = needsAttention({ orders, anchor: "2025-03-03" });
    expect(quiet.sections.map(({ rows, byCarrier }) => [rows.length, byCarrier.length])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(quiet.withinThreshold.map(({ order: { order_id } }) => order_id)).toEqual(["b"]);
  });

  it("links an empty section nowhere, though orders are in transit within the threshold (ADR 0011 §5: a count of 0 opens nothing)", () => {
    const orders = [order("a", "delivered", "2025-03-01", "2025-03-03"), order("b", "in_transit", "2025-03-02", null)];
    expect(needsAttention({ orders, anchor: "2025-03-03" }).sections.map(({ linkedOrderCount }) => linkedOrderCount)).toEqual([0, 0, 0, 0]);
    const nothingDelivered = [order("c", "in_transit", "2025-01-02", null)];
    expect(needsAttention({ orders: nothingDelivered, anchor: "2025-03-03" }).sections[0]?.linkedOrderCount).toBe(0);
  });
});
