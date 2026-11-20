import type { Ratio } from "@/domain/definitions";
import type { ResultRow } from "@/tools/query";

/** A rate row's parts. Every rate row carries them; one without them is a bug upstream, so it throws. */
export function rowRatio(row: ResultRow): Ratio {
  if (row.numerator === undefined || row.denominator === undefined) throw new Error(`"${row.label}" carries no rate`);
  return { numerator: row.numerator, denominator: row.denominator, value: row.value };
}
