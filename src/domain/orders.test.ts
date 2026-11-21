import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DATASET_FILE, getDataset, IMPORT_LIMITS, orderRowSchema, ordersCsv, parseOrders, validateOrders } from "./orders";

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

  it("throws on an invalid row, naming its row as a spreadsheet numbers it (the header is row 1, ticket 35) and its column", () => {
    const csv = [HEADER, csvLine(validRow), csvLine({ ...validRow, order_id: "ORD-2" }), csvLine({ ...validRow, order_id: "ORD-3", quantity: "1x5" })].join("\n");
    expect(() => parseOrders(csv)).toThrow(/row 4\b.*quantity/);
  });
});

/** A CSV of the header and one row per override of validRow, each with its own order_id unless given. */
function fileOf(...overrides: Record<string, string>[]): string {
  const rows = overrides.map((override, index) => csvLine({ ...validRow, order_id: `ORD-2026-000000-${String(index + 1).padStart(4, "0")}`, ...override }));
  return `${[HEADER, ...rows].join("\n")}\n`;
}

/** The problems of a file as "row column: message", the row as a spreadsheet numbers it (the header is row 1). */
function problemsOf(csv: string): string[] {
  return validateOrders(csv).problems.map(({ row, column, message }) => `${row ?? "-"} ${column ?? "-"}: ${message}`);
}

describe("validateOrders: the import rules (ticket 35)", () => {
  it("passes the file in data/, all 400 orders, with no problem", () => {
    const result = validateOrders(readFileSync(path.join(process.cwd(), "data", DATASET_FILE), "utf8"));
    expect(result.problems).toEqual([]);
    expect(result.rows).toBe(400);
    expect(result.orders).toHaveLength(400);
  });

  it("passes a clean file, typed as parseOrders types it", () => {
    const result = validateOrders(fileOf({}, { status: "in_transit", delivery_date: "" }));
    expect(result.problems).toEqual([]);
    expect(result.orders.map((order) => order.delivery_date)).toEqual(["2025-10-22", null]);
  });

  describe("header: exactly the file's columns, in its order", () => {
    it("names a missing column and one the file does not have", () => {
      const header = HEADER.replace("carrier", "courier");
      const csv = `${header}\n${csvLine(validRow)}\n`;
      expect(problemsOf(csv)).toEqual(["1 courier: Not a column of the file", "1 carrier: Missing"]);
    });

    it("says when the columns are all there but in another order", () => {
      const columns = HEADER.split(",");
      const swapped = [columns[1], columns[0], ...columns.slice(2)].join(",");
      expect(problemsOf(`${swapped}\n${csvLine(validRow)}\n`)).toEqual([`1 -: The columns are in another order. Expected: ${columns.join(", ")}`]);
    });

    it("names a column given twice", () => {
      expect(problemsOf(`${HEADER},warehouse\n${csvLine(validRow)},LON-FC1\n`)).toEqual(["1 warehouse: Given twice"]);
    });

    it("checks no row under a wrong header, but still counts them", () => {
      const result = validateOrders(`${HEADER.replace("sku", "item")}\n${csvLine({ ...validRow, quantity: "x" })}\n`);
      expect(result.problems.map((problem) => problem.row)).toEqual([1, 1]);
      expect(result.rows).toBe(1);
    });
  });

  it("fixed values: carrier, region, warehouse, origin and category take a value the query spec knows", () => {
    const problems = problemsOf(fileOf({ carrier: "Acme" }, { region: "APAC" }, { warehouse: "SYD-DC1" }, { origin_city: "Sydney, AU" }, { product_category: "GLUE" }));
    expect(problems).toEqual([
      '2 carrier: Unknown carrier "Acme". Known: DHL, DPD, FedEx, GLS, LaserShip, OnTrac, Royal Mail, UPS, USPS',
      '3 region: Unknown region "APAC". Known: EU, UK, US-C, US-E, US-W',
      '4 warehouse: Unknown warehouse "SYD-DC1". Known: AMS-FC1, ATL-DC1, BER-FC1, CHI-DC1, DFW-DC1, EWR-DC1, LAX-DC1, LON-FC1, SFO-DC2',
      '5 origin_city: Unknown origin city "Sydney, AU". Known: Amsterdam, NL; Atlanta, GA; Berlin, DE; Chicago, IL; Dallas, TX; London, UK; Los Angeles, CA; Newark, NJ; San Francisco, CA',
      '6 product_category: Unknown category "GLUE". Known: BOOK, BRUSH, CRAYON, MARKER, PAINT, PAPER, PENCIL, STICKER',
    ]);
  });

  it("unique IDs: an order_id seen before is a problem on each later row, naming the first", () => {
    const id = "ORD-2026-000000-0001";
    expect(problemsOf(fileOf({ order_id: id }, {}, { order_id: id }, { order_id: id }))).toEqual([
      "4 order_id: Also on row 2",
      "5 order_id: Also on row 2",
    ]);
  });

  describe("dates and status", () => {
    it("an order in transit or canceled has no delivery date", () => {
      expect(problemsOf(fileOf({ status: "in_transit" }, { status: "canceled" }))).toEqual([
        "2 delivery_date: Must be empty for an order in transit",
        "3 delivery_date: Must be empty for a canceled order",
      ]);
    });

    it("a delivered, delayed or exception order has one", () => {
      expect(problemsOf(fileOf({ delivery_date: "" }, { status: "delayed", delivery_date: "" }, { status: "exception", delivery_date: "" }))).toEqual([
        "2 delivery_date: Needed for a delivered order",
        "3 delivery_date: Needed for a delayed order",
        "4 delivery_date: Needed for an exception order",
      ]);
    });

    it("a delivery date is never earlier than the order date; the same day is fine", () => {
      expect(problemsOf(fileOf({ delivery_date: "2025-10-18" }, { delivery_date: "2025-10-19" }))).toEqual(["2 delivery_date: Before the order date, 2025-10-19"]);
    });
  });

  it("order value: quantity × unit price, to the cent (trap 6)", () => {
    expect(problemsOf(fileOf({ order_value_usd: "26.21" }, { order_value_usd: "26.220" }, { quantity: "3", unit_price_usd: "0.1", order_value_usd: "0.3" }))).toEqual([
      "2 order_value_usd: Expected 2 × 13.11 = 26.22",
    ]);
  });

  describe("no formulas: free-text cells", () => {
    it.each(["=1+2", "+1", "-1", "@SUM(A1)"])("refuse a cell starting %s, in each free-text column", (value) => {
      const columns = ["client_id", "order_id", "destination_city", "sku"];
      expect(problemsOf(fileOf(...columns.map((column) => ({ [column]: value }))))).toEqual(
        columns.map((column, index) => `${index + 2} ${column}: Starts with ${value[0]}, which a spreadsheet would run as a formula`),
      );
    });

    it("are at most 100 characters", () => {
      expect(problemsOf(fileOf({ sku: "S".repeat(100) }, { sku: "S".repeat(101) }))).toEqual(["3 sku: Over 100 characters"]);
    });
  });

  it("names the column of a cell the row schema refuses, in words", () => {
    expect(problemsOf(fileOf({ order_date: "2025-02-30", quantity: "1x5", status: "lost", is_promo: "yes", client_id: "" }))).toEqual([
      "2 client_id: Empty",
      "2 order_date: Expected a date as YYYY-MM-DD",
      "2 status: Expected one of delivered, delayed, in_transit, exception, canceled",
      "2 quantity: Expected a number",
      "2 is_promo: Expected 0 or 1",
    ]);
  });

  it("names a row with too few or too many cells", () => {
    const csv = `${HEADER}\n${csvLine(validRow)}\nCL-1,ORD-2\n${csvLine(validRow)},extra\n`;
    expect(problemsOf(csv)).toEqual(["3 -: 2 cells; the header has 17", "4 -: 18 cells; the header has 17"]);
  });

  it("collects every problem in the file, row by row, instead of stopping at the first", () => {
    const result = validateOrders(fileOf({ carrier: "Acme" }, {}, { quantity: "", sku: "=x" }));
    expect(result.problems.map(({ row, column }) => `${row} ${column}`)).toEqual(["2 carrier", "4 sku", "4 quantity"]);
    expect(result.rows).toBe(3);
  });

  it("is all or nothing: with any problem, no order is kept", () => {
    const result = validateOrders(fileOf({}, {}, { carrier: "Acme" }));
    expect(result.rows).toBe(3);
    expect(result.orders).toEqual([]);
  });

  it("strips a byte-order mark and reads Windows line ends", () => {
    const result = validateOrders(`﻿${fileOf({}, {}).replaceAll("\n", "\r\n")}`);
    expect(result.problems).toEqual([]);
    expect(result.orders).toHaveLength(2);
  });

  describe("size", () => {
    it(`refuses more than ${IMPORT_LIMITS.rows.toLocaleString("en-US")} rows without checking them`, () => {
      const row = csvLine({ ...validRow, carrier: "Acme" });
      const csv = `${HEADER}\n${`${row}\n`.repeat(IMPORT_LIMITS.rows + 1)}`;
      expect(validateOrders(csv)).toEqual({ rows: IMPORT_LIMITS.rows + 1, orders: [], problems: [{ row: null, column: null, message: "More than 20,000 rows" }] });
    });

    it(`passes exactly ${IMPORT_LIMITS.rows.toLocaleString("en-US")} rows`, () => {
      const csv = fileOf(...Array.from({ length: IMPORT_LIMITS.rows }, () => ({})));
      expect(validateOrders(csv).problems).toEqual([]);
    });

    it("refuses a file over 5 MB, which is 5,242,880 bytes", () => {
      expect(IMPORT_LIMITS.bytes).toBe(5 * 1024 * 1024);
      const csv = `${HEADER}\n${"x".repeat(IMPORT_LIMITS.bytes)}`;
      expect(validateOrders(csv).problems).toEqual([{ row: null, column: null, message: "Over 5 MB" }]);
    });

    it("refuses a file without orders", () => {
      expect(problemsOf(`${HEADER}\n`)).toEqual(["- -: No orders under the header"]);
      expect(problemsOf("")).toEqual(["- -: The file is empty"]);
    });
  });

  it("says where a file stops being CSV", () => {
    expect(problemsOf(`${HEADER}\n${csvLine(validRow)}\nCL-1,"ORD-2\n`)).toEqual(["3 -: Not readable as CSV: a quote is opened and never closed"]);
  });
});

describe("ordersCsv", () => {
  it("writes an order back as the file has it, and a value that could start a formula with a leading ' (ticket 34)", () => {
    const [order] = parseOrders(`${HEADER}\n${csvLine(validRow)}\n`);
    if (order === undefined) throw new Error("no order");
    expect(ordersCsv([order])).toBe(`${HEADER}\n${csvLine(validRow)}\n`);
    expect(ordersCsv([{ ...order, client_id: "=cmd|' /C calc'!A0" }]).split("\n")[1]).toMatch(/^'=cmd\|' \/C calc'!A0,ORD-2026-267300-0001,/);
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
