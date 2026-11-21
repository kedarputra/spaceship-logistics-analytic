import { describe, expect, it } from "vitest";
import { getDataset, type Order } from "@/domain/orders";
import { inventory } from "./inventory";

/** One order of `sku` in `category`, worth `value`. */
function sold(sku: string, value: number, category = sku.split("-")[0] ?? ""): Order {
  return {
    client_id: "CL-1000",
    order_id: `ORD-${sku}-${value}`,
    order_date: "2025-05-01",
    delivery_date: "2025-05-03",
    carrier: "DHL",
    origin_city: "London, UK",
    destination_city: "Leeds, UK",
    status: "delivered",
    sku,
    product_category: category,
    quantity: 1,
    unit_price_usd: value,
    order_value_usd: value,
    is_promo: false,
    promo_discount_pct: 0,
    region: "UK",
    warehouse: "LON-FC1",
  };
}

/** A figure to the cent, as the page shows it. */
const usd = (value: number) => Number(value.toFixed(2));

// Golden numbers: ticket 33, recomputed from data/mock_logistics_data.csv.
describe("Inventory: the ABC classes and the categories (ticket 33)", () => {
  const { orders } = getDataset();
  const file = inventory(orders);

  it("sums the file's 355 SKUs to USD 13,695.87", () => {
    expect(file.skus).toHaveLength(355);
    expect(usd(file.total.figures.grossValue)).toBe(13695.87);
    expect(file.total).toMatchObject({ figures: { orders: 400, units: 1310 }, share: { value: 1 } });
  });

  it("splits them into A 174 SKUs, USD 10,961.89; B 103, USD 2,054.36; C 78, USD 679.62", () => {
    expect(file.classes.map(({ abcClass, skus, value }) => [abcClass, skus.numerator, usd(value.numerator)])).toEqual([
      ["A", 174, 10961.89],
      ["B", 103, 2054.36],
      ["C", 78, 679.62],
    ]);
    expect(file.classes.map(({ skus }) => skus.denominator)).toEqual([355, 355, 355]);
    // A's value reaches 80% (80.04%), A and B together 95% (95.04%).
    expect((file.classes[0]?.value.value ?? Number.NaN) * 100).toBeCloseTo(80.04, 2);
    expect((file.classes[1]?.value.value ?? Number.NaN) * 100).toBeCloseTo(15.0, 2);
  });

  it("calls the file's catalogue flat: half its SKUs (174 of 355, 49%) make 80% of the value, where a Pareto 80/20 would need a fifth", () => {
    expect(file.shape).toBe("flat");
    expect(file.classes[0]?.skus.value ?? Number.NaN).toBeCloseTo(0.4901, 4);
  });

  it("calls a catalogue concentrated when A holds a fifth of the SKUs or fewer, and flat beyond", () => {
    // One SKU of five makes 80%: a fifth, concentrated.
    expect(inventory([sold("PAPER-0001", 80), ...["2", "3", "4", "5"].map((n) => sold(`PAPER-000${n}`, 5))]).shape).toBe("concentrated");
    // Two of five: flat.
    expect(inventory([sold("PAPER-0001", 60), sold("PAPER-0002", 25), ...["3", "4", "5"].map((n) => sold(`PAPER-000${n}`, 5))]).shape).toBe("flat");
  });

  it("gives an empty class no SKUs and no value, and no orders no classes", () => {
    const one = inventory([sold("PAPER-0001", 10)]);
    expect(one.classes.map(({ abcClass, skus }) => [abcClass, skus.numerator])).toEqual([
      ["A", 1],
      ["B", 0],
      ["C", 0],
    ]);
    expect(inventory([]).classes.every(({ skus }) => skus.numerator === 0)).toBe(true);
  });

  it("lists the categories by gross value, highest first, with orders, units and share of value: PAINT first at USD 2,288.10", () => {
    expect(file.categories.map(({ category, figures }) => [category, figures.orders, figures.units, usd(figures.grossValue)])).toEqual([
      ["PAINT", 49, 105, 2288.1],
      ["PAPER", 43, 196, 2023.3],
      ["BRUSH", 49, 169, 1903.85],
      ["MARKER", 51, 122, 1873.7],
      ["CRAYON", 69, 229, 1841.3],
      ["BOOK", 42, 95, 1649.84],
      ["STICKER", 52, 222, 1164.99],
      ["PENCIL", 45, 172, 950.79],
    ]);
    expect((file.categories[0]?.share.value ?? Number.NaN) * 100).toBeCloseTo(16.71, 2);
    expect(file.categories.reduce((sum, { share }) => sum + (share.value ?? 0), 0)).toBeCloseTo(1, 12);
  });

  it("breaks a tie in category value by name", () => {
    expect(inventory([sold("PAPER-0001", 10), sold("BOOK-0001", 10)]).categories.map(({ category }) => category)).toEqual(["BOOK", "PAPER"]);
  });
});
