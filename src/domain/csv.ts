/**
 * Writing CSV (tickets 28 and 34): the one cell writer every download uses, the orders and the monthly
 * report alike. No imports.
 */

/**
 * The characters a spreadsheet may read as the start of a formula. A cell that starts with one gets a
 * leading ', which spreadsheets show as text and never run (CSV injection).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** A CSV field: a leading ' when it could start a formula, then quoted when it holds a comma, a quote or a line break. */
export function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** One line of a CSV file, without its line break. */
export function csvLine(values: readonly string[]): string {
  return values.map(csvField).join(",");
}
