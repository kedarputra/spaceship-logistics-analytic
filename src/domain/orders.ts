import { createHash } from "node:crypto";
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

/**
 * The columns that take one of a fixed list of values: those in the file. The query spec's small
 * dimensions and the model's prompt list them (tools/spec.ts), so an import may not add one: a new
 * carrier would be a value Ask cannot name (ticket 35). A test checks they are exactly the file's.
 */
export const FIXED_VALUES = {
  carrier: ["DHL", "DPD", "FedEx", "GLS", "LaserShip", "OnTrac", "Royal Mail", "UPS", "USPS"],
  region: ["EU", "UK", "US-C", "US-E", "US-W"],
  warehouse: ["AMS-FC1", "ATL-DC1", "BER-FC1", "CHI-DC1", "DFW-DC1", "EWR-DC1", "LAX-DC1", "LON-FC1", "SFO-DC2"],
  origin_city: [
    "Amsterdam, NL",
    "Atlanta, GA",
    "Berlin, DE",
    "Chicago, IL",
    "Dallas, TX",
    "London, UK",
    "Los Angeles, CA",
    "Newark, NJ",
    "San Francisco, CA",
  ],
  product_category: ["BOOK", "BRUSH", "CRAYON", "MARKER", "PAINT", "PAPER", "PENCIL", "STICKER"],
} as const;

const FIXED_VALUE_NAMES: Record<keyof typeof FIXED_VALUES, string> = {
  carrier: "carrier",
  region: "region",
  warehouse: "warehouse",
  origin_city: "origin city",
  product_category: "category",
};

/** The columns of free text, which a spreadsheet could read as a formula when the file is downloaded again. */
const FREE_TEXT_COLUMNS = ["client_id", "order_id", "destination_city", "sku"] as const;

/** An import's limits (ticket 35): its size, its rows, and the length of a free-text cell. */
export const IMPORT_LIMITS = { bytes: 5 * 1024 * 1024, rows: 20_000, textLength: 100 } as const;

/** The limits in words: "5 MB", "20,000 rows", and "at most 5 MB and 20,000 rows". */
export const IMPORT_LIMITS_TEXT = {
  bytes: `${IMPORT_LIMITS.bytes / (1024 * 1024)} MB`,
  rows: `${IMPORT_LIMITS.rows.toLocaleString("en-US")} rows`,
  both: `at most ${IMPORT_LIMITS.bytes / (1024 * 1024)} MB and ${IMPORT_LIMITS.rows.toLocaleString("en-US")} rows`,
} as const;

const text = z.string().min(1, "Empty");
const isoDate = z.iso.date({ error: "Expected a date as YYYY-MM-DD" });
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
  delivery_date: z
    .union([z.literal(""), isoDate], { error: "Expected a date as YYYY-MM-DD, or nothing" })
    .transform((value) => (value === "" ? null : value)),
  carrier: text,
  origin_city: text,
  destination_city: text,
  status: z.enum(ORDER_STATUSES, { error: `Expected one of ${ORDER_STATUSES.join(", ")}` }),
  sku: text,
  product_category: text,
  quantity: decimal,
  unit_price_usd: decimal,
  order_value_usd: decimal,
  // Not z.coerce.boolean(), which reads "0" as true (ADR 0005).
  is_promo: z.enum(["0", "1"], { error: "Expected 0 or 1" }).transform((value) => value === "1"),
  promo_discount_pct: decimal,
  region: text,
  warehouse: text,
});

export type Order = z.output<typeof orderRowSchema>;

/** The file's columns, in its order. */
export const ORDER_COLUMNS = orderRowSchema.keyof().options;
type Column = (typeof ORDER_COLUMNS)[number];

export interface Dataset {
  orders: readonly Order[];
  /** The latest order_date or delivery_date (ADR 0002). */
  anchor: string;
}

/**
 * The dataset a session's pages, Ask, reports and downloads run on (ticket 35): the file in data/, or
 * the session's import.
 */
export interface ActiveDataset extends Dataset {
  /** A hash of the file's content: what the question cache and the spec's values are kept apart by. */
  id: string;
  /** The file's name, as the rail, Raw data and the report's PDF show it. */
  fileName: string;
  /** True for an import, false for the file in data/. */
  imported: boolean;
}

/**
 * One thing wrong with a file. `row` counts as a spreadsheet does, the header being row 1, so the first
 * order is row 2; `column` is the file's. Both are null for the file as a whole.
 */
export interface OrderProblem {
  row: number | null;
  column: string | null;
  message: string;
}

export interface CheckedOrders {
  /** The rows under the header, whether or not they are valid. */
  rows: number;
  /** Every order, or none: a file with any problem keeps no order (all or nothing). */
  orders: Order[];
  problems: OrderProblem[];
}

/** A record as csv-parse gives it with `info: true`; `lines` is the line it ends on, the header's being 1. */
interface ParsedRecord {
  record: string[];
  info: { lines: number };
}

const fileProblem = (message: string, rows = 0): CheckedOrders => ({ rows, orders: [], problems: [{ row: null, column: null, message }] });

/** Why csv-parse could not read on, in words. */
function csvErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "CSV_QUOTE_NOT_CLOSED") return "a quote is opened and never closed";
  if (code === "INVALID_OPENING_QUOTE") return "a quote inside a cell that does not start with one";
  return error instanceof Error ? error.message : "unknown error";
}

function csvErrorLine(error: unknown): number | null {
  return typeof error === "object" && error !== null && "lines" in error && typeof error.lines === "number" ? error.lines : null;
}

/** The header's problems: a column it lacks, one the file does not have, one given twice, or the order. */
function headerProblems(header: readonly string[]): OrderProblem[] {
  const problems: OrderProblem[] = [];
  const seen = new Set<string>();
  for (const name of header) {
    if (!ORDER_COLUMNS.some((column) => column === name)) problems.push({ row: 1, column: name, message: "Not a column of the file" });
    else if (seen.has(name)) problems.push({ row: 1, column: name, message: "Given twice" });
    seen.add(name);
  }
  for (const column of ORDER_COLUMNS) if (!seen.has(column)) problems.push({ row: 1, column, message: "Missing" });
  if (problems.length === 0 && header.some((name, index) => name !== ORDER_COLUMNS[index])) {
    problems.push({ row: 1, column: null, message: `The columns are in another order. Expected: ${ORDER_COLUMNS.join(", ")}` });
  }
  return problems;
}

const STATUS_WORDS: Record<Order["status"], string> = {
  delivered: "a delivered order",
  delayed: "a delayed order",
  in_transit: "an order in transit",
  exception: "an exception order",
  canceled: "a canceled order",
};

/** The rules on a row's cells as written: fixed values and free text. They need no parsing. */
function cellProblems(cells: Record<Column, string>, row: number): OrderProblem[] {
  const problems: OrderProblem[] = [];
  for (const [column, values] of Object.entries(FIXED_VALUES) as [keyof typeof FIXED_VALUES, readonly string[]][]) {
    const value = cells[column];
    if (value !== "" && !values.includes(value)) {
      const known = values.join(column === "origin_city" ? "; " : ", ");
      problems.push({ row, column, message: `Unknown ${FIXED_VALUE_NAMES[column]} "${value}". Known: ${known}` });
    }
  }
  for (const column of FREE_TEXT_COLUMNS) {
    const value = cells[column];
    if (value.length > IMPORT_LIMITS.textLength) problems.push({ row, column, message: `Over ${IMPORT_LIMITS.textLength} characters` });
    else if (/^[=+\-@]/.test(value)) problems.push({ row, column, message: `Starts with ${value[0]}, which a spreadsheet would run as a formula` });
  }
  return problems;
}

/** The rules between a valid order's fields: the delivery date against the status and the order date, and the value. */
function orderProblems(order: Order, row: number): OrderProblem[] {
  const problems: OrderProblem[] = [];
  const open = order.status === "in_transit" || order.status === "canceled";
  if (open && order.delivery_date !== null) {
    problems.push({ row, column: "delivery_date", message: `Must be empty for ${STATUS_WORDS[order.status]}` });
  } else if (!open && order.delivery_date === null) {
    problems.push({ row, column: "delivery_date", message: `Needed for ${STATUS_WORDS[order.status]}` });
  } else if (order.delivery_date !== null && order.delivery_date < order.order_date) {
    problems.push({ row, column: "delivery_date", message: `Before the order date, ${order.order_date}` });
  }
  // Gross value as given (trap 6), compared in whole cents so 3 × 0.1 is 0.30.
  const expected = Math.round(order.quantity * order.unit_price_usd * 100);
  if (expected !== Math.round(order.order_value_usd * 100)) {
    problems.push({ row, column: "order_value_usd", message: `Expected ${order.quantity} × ${order.unit_price_usd} = ${(expected / 100).toFixed(2)}` });
  }
  return problems;
}

/** A row's problems in the file's column order, the row's own (its cell count) first. */
function inColumnOrder(problems: OrderProblem[]): OrderProblem[] {
  const position = (column: string | null) => (column === null ? -1 : ORDER_COLUMNS.findIndex((name) => name === column));
  return problems.toSorted((a, b) => position(a.column) - position(b.column));
}

/**
 * Checks an orders CSV against the import rules (ticket 35) and collects every problem, each with its
 * row, column and message, instead of stopping at the first:
 *
 * - size: at most 5 MB and 20,000 rows, and at least one row;
 * - header: exactly the file's columns, in its order;
 * - every row: the row schema (ADR 0005), fixed values, unique order IDs, the delivery date against the
 *   status and the order date, order value = quantity × unit price to the cent, and free-text cells of
 *   at most 100 characters that cannot start a formula.
 *
 * All or nothing: with any problem, `orders` is empty. A byte-order mark is stripped.
 */
export function validateOrders(csv: string): CheckedOrders {
  if (Buffer.byteLength(csv, "utf8") > IMPORT_LIMITS.bytes) return fileProblem(`Over ${IMPORT_LIMITS_TEXT.bytes}`);
  let records: ParsedRecord[];
  try {
    // csv-parse's types do not model `info: true`, which wraps each record with where it ends in the file.
    records = parse(csv, { bom: true, relax_column_count: true, skip_empty_lines: true, info: true }) as unknown as ParsedRecord[];
  } catch (error) {
    return { rows: 0, orders: [], problems: [{ row: csvErrorLine(error), column: null, message: `Not readable as CSV: ${csvErrorMessage(error)}` }] };
  }
  const [header, ...body] = records;
  if (header === undefined) return fileProblem("The file is empty");
  const rows = body.length;
  if (rows === 0) return fileProblem("No orders under the header");
  if (rows > IMPORT_LIMITS.rows) return fileProblem(`More than ${IMPORT_LIMITS_TEXT.rows}`, rows);

  const problems = headerProblems(header.record);
  if (problems.length > 0) return { rows, orders: [], problems };

  const orders: Order[] = [];
  const firstRowOf = new Map<string, number>();
  for (const { record, info } of body) {
    const row = info.lines;
    if (record.length !== ORDER_COLUMNS.length) {
      problems.push({ row, column: null, message: `${record.length} ${record.length === 1 ? "cell" : "cells"}; the header has ${ORDER_COLUMNS.length}` });
      continue;
    }
    const cells = Object.fromEntries(ORDER_COLUMNS.map((column, index) => [column, record[index] ?? ""])) as Record<Column, string>;
    const rowProblems = cellProblems(cells, row);
    const first = firstRowOf.get(cells.order_id);
    if (first === undefined) firstRowOf.set(cells.order_id, row);
    else rowProblems.push({ row, column: "order_id", message: `Also on row ${first}` });
    const parsed = orderRowSchema.safeParse(cells);
    if (parsed.success) {
      rowProblems.push(...orderProblems(parsed.data, row));
      orders.push(parsed.data);
    } else {
      rowProblems.push(...parsed.error.issues.map((issue) => ({ row, column: String(issue.path[0] ?? ""), message: issue.message })));
    }
    problems.push(...inColumnOrder(rowProblems));
  }
  return { rows, orders: problems.length === 0 ? orders : [], problems };
}

/**
 * Parses the orders CSV: validateOrders, which must find no problem. An invalid file throws with the
 * first problem and its row as a spreadsheet numbers it (the header is row 1); a row is never skipped,
 * because a dropped row would change every KPI.
 */
export function parseOrders(csv: string): Order[] {
  const { orders, problems } = validateOrders(csv);
  const [first] = problems;
  if (first === undefined) return orders;
  throw new Error(`Invalid orders file${first.row === null ? "" : ` at row ${first.row}`}: ${first.column ?? "row"}: ${first.message}`);
}

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

/** A dataset's ID: the SHA-256 of its text, so the same content is the same dataset wherever it came from. */
export function datasetId(csv: string): string {
  return createHash("sha256").update(csv).digest("hex");
}

/** Orders that passed validateOrders, as a dataset named `fileName`, its anchor computed from them (ADR 0002). */
export function datasetOf(orders: readonly Order[], source: { csv: string; fileName: string; imported: boolean }): ActiveDataset {
  return { orders, anchor: anchorDate(orders), id: datasetId(source.csv), fileName: source.fileName, imported: source.imported };
}

/** Reads and validates a dataset file. Read-only: nothing here writes to data/. */
export function loadDataset(filePath: string): ActiveDataset {
  const csv = readFileSync(filePath, "utf8");
  return datasetOf(parseOrders(csv), { csv, fileName: path.basename(filePath), imported: false });
}

let dataset: ActiveDataset | undefined;

/**
 * The file in data/, read on first use and then kept for the life of the server instance. A session
 * without an import runs on it; app/ picks the session's active dataset (ticket 35).
 */
export function getDataset(): ActiveDataset {
  dataset ??= loadDataset(DATASET_PATH);
  return dataset;
}
