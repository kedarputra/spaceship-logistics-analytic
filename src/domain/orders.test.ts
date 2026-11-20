import { describe, expect, it } from "vitest";
import { getDataset, orderRowSchema, parseOrders } from "./orders";

const HEADER =
  "client_id,order_id,order_date,delivery_date,carrier,origin_city,destination_city,status,sku,product_category,quantity,unit_price_usd,order_value_usd,is_promo,promo_discount_pct,region,warehouse";

// The first row of the dataset, as csv-parse hands it over: every value is a string.
const validRow = {
  client_id: "CL-1023",
  order_id: "ORD-2026-267300-0001",
  order_date: "2025-10-19",
  delivery_date: "2025-10-22",
  carrier: "DHL",
  origin_city: "London, UK",
  destination_city: "Leeds, UK",
  status: "delivered",
  sku: "PAPER-0197",
  product_category: "PAPER",
  quantity: "2",
  unit_price_usd: "13.11",
  order_value_usd: "26.22",
  is_promo: "0",
  promo_discount_pct: "0",
  region: "UK",
  warehouse: "LON-FC1",
};

function csvLine(row: Record<string, string>): string {
  return Object.values(row)
    .map((value) => (value.includes(",") ? `"${value}"` : value))
    .join(",");
}

function accepts(overrides: Record<string, string>): boolean {
  return orderRowSchema.safeParse({ ...validRow, ...overrides }).success;
}

describe("order row schema (ADR 0005)", () => {
  it("turns a CSV row into a typed order", () => {
    expect(orderRowSchema.parse(validRow)).toEqual({
      ...validRow,
      quantity: 2,
      unit_price_usd: 13.11,
      order_value_usd: 26.22,
      is_promo: false,
      promo_discount_pct: 0,
    });
  });

  it('reads is_promo "0" as false and "1" as true', () => {
    expect(orderRowSchema.parse({ ...validRow, is_promo: "0" }).is_promo).toBe(false);
    expect(orderRowSchema.parse({ ...validRow, is_promo: "1" }).is_promo).toBe(true);
  });

  it("rejects is_promo values other than 0 and 1", () => {
    expect(accepts({ is_promo: "true" })).toBe(false);
    expect(accepts({ is_promo: "" })).toBe(false);
  });

  it("turns an empty delivery_date into null", () => {
    expect(orderRowSchema.parse({ ...validRow, status: "in_transit", delivery_date: "" }).delivery_date).toBeNull();
  });

  it('rejects "" in a numeric column', () => {
    expect(accepts({ quantity: "" })).toBe(false);
    expect(accepts({ unit_price_usd: "" })).toBe(false);
    expect(accepts({ promo_discount_pct: "" })).toBe(false);
  });

  it('rejects "1x5" in a numeric column', () => {
    expect(accepts({ unit_price_usd: "1x5" })).toBe(false);
    expect(accepts({ order_value_usd: "1x5" })).toBe(false);
  });

  it("rejects an impossible date", () => {
    expect(accepts({ order_date: "2025-02-30" })).toBe(false);
    expect(accepts({ delivery_date: "2025-02-30" })).toBe(false);
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    expect(accepts({ order_date: "2025-2-3" })).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(accepts({ status: "lost" })).toBe(false);
  });

  it("rejects a column it does not know", () => {
    expect(accepts({ discount_code: "X" })).toBe(false);
  });
});

describe("parseOrders", () => {
  it("keeps quoted values that contain a comma whole", () => {
    const [order] = parseOrders([HEADER, csvLine(validRow)].join("\n"));
    expect(order?.origin_city).toBe("London, UK");
    expect(order?.destination_city).toBe("Leeds, UK");
  });

  it("throws on an invalid row and names its row number", () => {
    const csv = [HEADER, csvLine(validRow), csvLine(validRow), csvLine({ ...validRow, quantity: "1x5" })].join("\n");
    expect(() => parseOrders(csv)).toThrow(/row 3\b.*quantity/);
  });
});

describe("the dataset file (docs/data.md)", () => {
  it("has 400 orders", () => {
    expect(getDataset().orders).toHaveLength(400);
  });

  it("has a unique order_id on every order", () => {
    const { orders } = getDataset();
    expect(new Set(orders.map((order) => order.order_id)).size).toBe(400);
  });

  it("has no delivery_date exactly for the 27 in-transit and 3 canceled orders", () => {
    const { orders } = getDataset();
    const open = (status: string) => status === "in_transit" || status === "canceled";
    expect(orders.filter((order) => (order.delivery_date === null) !== open(order.status))).toEqual([]);
    expect(orders.filter((order) => order.delivery_date === null)).toHaveLength(30);
  });

  it("never has a delivery_date before the order_date", () => {
    const { orders } = getDataset();
    expect(orders.filter((order) => order.delivery_date !== null && order.delivery_date < order.order_date)).toEqual([]);
  });

  it("has order value = quantity × unit price on every order, within 0.01", () => {
    const { orders } = getDataset();
    const off = orders.filter((order) => Math.abs(order.order_value_usd - order.quantity * order.unit_price_usd) > 0.01);
    expect(off).toEqual([]);
  });

  it("has a promo discount above 0 exactly on the 22 promo orders", () => {
    const { orders } = getDataset();
    expect(orders.filter((order) => order.promo_discount_pct > 0 !== order.is_promo)).toEqual([]);
    expect(orders.filter((order) => order.is_promo)).toHaveLength(22);
  });

  it("has the anchor date 2025-12-31, the latest order or delivery date", () => {
    expect(getDataset().anchor).toBe("2025-12-31");
  });

  it("is read once and then reused", () => {
    expect(getDataset()).toBe(getDataset());
  });
});
