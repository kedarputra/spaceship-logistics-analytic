/**
 * Writing CSV (tickets 28 and 34): the one cell writer every download uses, the orders and the monthly
 * report alike; and counting an upload's records as it is read (ticket 35). No imports.
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

const LINE_FEED = "\n";
const CARRIAGE_RETURN = "\r";

/**
 * Counts a CSV's records while its text arrives in pieces (ticket 35), so an upload over the row limit
 * is stopped while it is read: a line break outside quotes ends a record, and a line with nothing on it
 * is not one, as the reader skips it. A doubled quote inside quotes leaves them, then enters them again.
 */
export function csvRecordCounter(): { push(text: string): number } {
  let quoted = false;
  let lineHasContent = false;
  let ended = 0;
  return {
    /** Takes the next piece of text; returns the records so far, the last one counted even before its line break. */
    push(text) {
      for (const char of text) {
        if (char === '"') {
          quoted = !quoted;
          lineHasContent = true;
        } else if (char === LINE_FEED && !quoted) {
          if (lineHasContent) ended += 1;
          lineHasContent = false;
        } else if (char !== CARRIAGE_RETURN) {
          lineHasContent = true;
        }
      }
      return ended + (lineHasContent ? 1 : 0);
    },
  };
}
