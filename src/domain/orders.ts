import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { csvLine } from "./csv";
import { anchorDate } from "./periods";

export const ORDER_STATUSES = ["delivered", "delayed", "in_transit", "exception", "canceled"] as const;

/** The dataset file, in data/. */
export const DATASET_FILE = "mock_logistics_data.csv";

const DATASET_PATH = path.join(process.cwd(), "data", DATASET_FILE);

const text = z.string().min(1);
const isoDate = z.iso.date();
// Not z.coerce.number(), which reads "" as 0. The escaped dot keeps "1x5" out (ADR 0005).
const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "Expected a number")
  .transform(Number);

/** One CSV row (all strings) to a typed order. Column names stay as in the CSV. */
export const orderRowSchema = z.strictObject({
  client_id: text,
  order_id: text,
  order_date: isoDate,
  delivery_date: z.union([z.literal(""), isoDate]).transform((value) => (value === "" ? null : value)),
  carrier: text,
  origin_city: text,
  destination_city: text,
  status: z.enum(ORDER_STATUSES),
  sku: text,
  product_category: text,
  quantity: decimal,
  unit_price_usd: decimal,
  order_value_usd: decimal,
  // Not z.coerce.boolean(), which reads "0" as true (ADR 0005).
  is_promo: z.enum(["0", "1"]).transform((value) => value === "1"),
  promo_discount_pct: decimal,
  region: text,
  warehouse: text,
});

export type Order = z.output<typeof orderRowSchema>;

export interface Dataset {
  orders: readonly Order[];
  /** The latest order_date or delivery_date (ADR 0002). */
  anchor: string;
}

/**
 * Parses the orders CSV. An invalid row throws with its row number (1 = the first row after
 * the header); a row is never skipped, because a dropped row would change every KPI.
 */
export function parseOrders(csv: string): Order[] {
  const records = parse(csv, { columns: true });
  return records.map((record, index) => {
    const result = orderRowSchema.safeParse(record);
    if (!result.success) {
      const problems = result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`);
      throw new Error(`Invalid order at row ${index + 1}: ${problems.join("; ")}`);
    }
    return result.data;
  });
}

/** The file's columns, in its order. */
const ORDER_COLUMNS = orderRowSchema.keyof().options;

/** A value as the file writes it: an empty cell for no date, 1 or 0 for promo, numbers without padding. */
function rawValue(order: Order, column: keyof Order): string {
  const value = order[column];
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

/**
 * Orders as CSV in the file's own form: its header, then each order's raw values, quoted only where the
 * file quotes its cities. The way back from parseOrders, except that a value that could start a
 * spreadsheet formula gets a leading ' (csvField).
 */
export function ordersCsv(orders: readonly Order[]): string {
  const lines = [csvLine(ORDER_COLUMNS), ...orders.map((order) => csvLine(ORDER_COLUMNS.map((column) => rawValue(order, column))))];
  return `${lines.join("\n")}\n`;
}

/** Reads and validates a dataset file. Read-only: nothing here writes to data/. */
export function loadDataset(filePath: string): Dataset {
  const orders = parseOrders(readFileSync(filePath, "utf8"));
  return { orders, anchor: anchorDate(orders) };
}

let dataset: Dataset | undefined;

/** The dataset, read from data/ on first use and then kept for the life of the server instance. */
export function getDataset(): Dataset {
  dataset ??= loadDataset(DATASET_PATH);
  return dataset;
}
