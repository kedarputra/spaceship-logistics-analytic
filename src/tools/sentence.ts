import { isRateOrAverage, SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatCount, formatMetricValue } from "@/domain/format";
import { formatPeriod } from "@/domain/periods";
import type { QueryResult, ResultRow } from "./query";
import { type GroupBy, isTimeDimension } from "./spec";
import { DIMENSION_WORDS, dateFieldWords, filterList, periodWords } from "./words";

/**
 * The answer's opening sentence, written by code (ADR 0009 §4), and the facts block the model's
 * sentence is checked against. Both are built from the same formatted values, so every number a
 * template uses is in the facts, exactly as the UI shows it. /api/run answers with the template;
 * /api/ask uses it whenever the model's sentence fails the guard or the phrase call fails.
 */

const MAX_FACT_ROWS = 60;

function isRatio(result: QueryResult): boolean {
  return isRateOrAverage(result.metric.kind);
}

function value(result: QueryResult, row: ResultRow): string {
  return formatMetricValue(row.value, result.metric.unit);
}

/**
 * "25.0% (2 of 8)" for a rate, "3.8 days over 370 deliveries" for an average, "15" for a count.
 * For a small sample, its size is stressed once: "on only 8 deliveries" or "over only 8 deliveries".
 */
function detail(result: QueryResult, row: ResultRow, stressSmall = false): string {
  const only = stressSmall ? "only " : "";
  if (result.metric.kind === "average") return `${value(result, row)} over ${only}${formatCount(row.n)} deliveries`;
  if (result.metric.kind === "rate" && row.numerator !== undefined && row.denominator !== undefined) {
    const parts = `${value(result, row)} (${formatCount(row.numerator)} of ${formatCount(row.denominator)})`;
    return stressSmall ? `${parts} on only ${formatCount(row.n)} deliveries` : parts;
  }
  return value(result, row);
}

/** "A", "A and B", "A, B and C". */
function names(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "1–30 Nov 2025, by delivery date" */
function periodPhrase(result: QueryResult): string {
  return `${result.period.label}, by ${dateFieldWords(result.dateField)}`;
}

/** The leading rows that share the first row's value. */
function tiedFirst(rows: readonly ResultRow[]): ResultRow[] {
  const [first] = rows;
  return first === undefined ? [] : rows.filter((row) => row.value === first.value);
}

/** Rows holding the highest (or lowest) value, ignoring rows with no value. */
function extremes(rows: readonly ResultRow[], direction: "highest" | "lowest"): ResultRow[] {
  const values = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
  if (values.length === 0) return [];
  const target = direction === "highest" ? Math.max(...values) : Math.min(...values);
  return rows.filter((row) => row.value === target);
}

/** True when a limit dropped rows: then the rows kept are not the whole, and nothing is totalled. */
function isCut(result: QueryResult): boolean {
  return result.rows.length < result.totalRows;
}

function total(result: QueryResult): number {
  return result.rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
}

function outcomeTotals(result: QueryResult): { delivered: number; onTime: number; delayed: number; exception: number } {
  const sum = (pick: (row: ResultRow) => number) => result.rows.reduce((acc, row) => acc + pick(row), 0);
  return {
    delivered: sum((row) => row.value ?? 0),
    onTime: sum((row) => row.outcomes?.onTime ?? 0),
    delayed: sum((row) => row.outcomes?.delayed ?? 0),
    exception: sum((row) => row.outcomes?.exception ?? 0),
  };
}

function lowered(label: string): string {
  return `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * How a ranking is worded: `leader` opens a count ranking ("Most", "Fewest") or another ranking
 * ("Highest", "Lowest"); `direction` is "highest" or "lowest" inside a sentence.
 */
function rankingWords(result: QueryResult): { leader: string; direction: "highest" | "lowest" } {
  const ascending = result.spec.sort === "asc";
  const direction = ascending ? "lowest" : "highest";
  const countLike = result.metric.unit === "orders" || result.metric.unit === "units";
  if (countLike) return { leader: ascending ? "Fewest" : "Most", direction };
  return { leader: capitalized(direction), direction };
}

function categorySentence(result: QueryResult, groupBy: GroupBy): string {
  const metric = lowered(result.metric.label);
  const words = rankingWords(result);
  const { ranking } = result;
  if (!isRatio(result) || ranking === undefined) {
    const top = tiedFirst(result.rows);
    if (top[0] === undefined) return `No ${DIMENSION_WORDS[groupBy].many} in ${periodPhrase(result)}.`;
    const each = top.length > 1 ? " each" : "";
    return `${words.leader} ${metric}: ${names(top.map((row) => row.label))}, with ${value(result, top[0])}${each}.`;
  }
  const { top, topReliable, minDelivered } = ranking;
  const heading = `${capitalized(words.direction)} ${metric}`;
  switch (ranking.case) {
    case "reliable":
      return `${heading}: ${names(tiedFirst(result.rows).map((row) => `${row.label} ${detail(result, row)}`))}.`;
    case "small-sample-top": {
      const reliable =
        topReliable === undefined
          ? ""
          : `; among ${DIMENSION_WORDS[groupBy].many} with at least ${minDelivered}, ${topReliable.label} ${detail(result, topReliable)}`;
      return `${heading}: ${top.label} ${detail(result, top, true)}${reliable}.`;
    }
    case "no-reliable-group":
      return `No ${DIMENSION_WORDS[groupBy].one} has at least ${minDelivered} deliveries, so no ranking is reliable; the ${words.direction} is ${top.label} ${detail(result, top, true)}.`;
  }
}

function timeSentence(result: QueryResult, groupBy: GroupBy): string {
  const unit = DIMENSION_WORDS[groupBy];
  const heading = `${result.metric.label} by ${unit.one}, ${periodPhrase(result)}`;
  if (result.metric.id === "delivery_outcomes") {
    const totals = outcomeTotals(result);
    return `Delivery outcomes by ${unit.one}, ${periodPhrase(result)}: ${formatCount(totals.delivered)} delivered, ${formatCount(totals.onTime)} on time, ${formatCount(totals.delayed)} delayed and ${formatCount(totals.exception)} exception.`;
  }
  if (isRatio(result)) {
    // ADR 0001 §6: a point on fewer than 20 deliveries is never named as the highest or lowest.
    const reliable = result.rows.filter((row) => !row.smallSample);
    const highest = extremes(reliable, "highest");
    const lowest = extremes(reliable, "lowest");
    if (highest[0] === undefined || lowest[0] === undefined) {
      return `${heading}: no ${unit.one} has at least ${SMALL_SAMPLE_MIN_DELIVERED} deliveries, so no ${unit.one} stands out reliably.`;
    }
    const among = reliable.length < result.rows.length ? `, among ${unit.many} with at least ${SMALL_SAMPLE_MIN_DELIVERED} deliveries` : "";
    return `${heading}: highest in ${names(highest.map((row) => row.label))} (${value(result, highest[0])}), lowest in ${names(lowest.map((row) => row.label))} (${value(result, lowest[0])})${among}.`;
  }
  const peak = extremes(result.rows, "highest");
  if (peak[0] === undefined || peak[0].value === 0) return `${heading}: none.`;
  const each = peak.length > 1 ? " each" : "";
  const inAll = isCut(result) ? "" : `${formatMetricValue(total(result), result.metric.unit)} in all; `;
  return `${heading}: ${inAll}the most in ${names(peak.map((row) => row.label))} (${value(result, peak[0])}${each}).`;
}

/** The sentence code writes for a result, one template per kind (ADR 0009 §4). */
export function templateSentence(result: QueryResult): string {
  const groupBy = result.spec.groupBy;
  if (groupBy === undefined) {
    const [row] = result.rows;
    if (row === undefined) return `${result.metric.label}: no data in ${periodPhrase(result)}.`;
    return `${result.metric.label}: ${detail(result, row)} in ${periodPhrase(result)}.`;
  }
  return isTimeDimension(groupBy) ? timeSentence(result, groupBy) : categorySentence(result, groupBy);
}

/**
 * The groups any sentence for this result must name: the leaders of a ranking with all their ties,
 * and, when the top is a small sample, the top group with at least 20 (ADR 0001 §6).
 */
export function requiredNames(result: QueryResult): string[] {
  const groupBy = result.spec.groupBy;
  if (groupBy === undefined || isTimeDimension(groupBy)) return [];
  const { ranking } = result;
  if (ranking === undefined) return tiedFirst(result.rows).map((row) => row.label);
  switch (ranking.case) {
    case "reliable":
      return tiedFirst(result.rows).map((row) => row.label);
    case "small-sample-top":
      return ranking.topReliable === undefined ? [ranking.top.label] : [ranking.top.label, ranking.topReliable.label];
    case "no-reliable-group":
      return [];
  }
}

/** One row as the facts give it: "GLS: 25.0% (2 of 8), a small sample". */
function rowText(result: QueryResult, row: ResultRow): string {
  const notes: string[] = [];
  if (row.smallSample) notes.push("a small sample");
  if (row.partial && row.from !== undefined && row.to !== undefined) notes.push(`${formatPeriod({ from: row.from, to: row.to }, { year: false })} only`);
  const outcomes =
    row.outcomes === undefined
      ? ""
      : `: ${formatCount(row.outcomes.onTime)} on time, ${formatCount(row.outcomes.delayed)} delayed, ${formatCount(row.outcomes.exception)} exception`;
  return `${row.label}: ${detail(result, row)}${outcomes}${notes.length > 0 ? `, ${notes.join(", ")}` : ""}`;
}

/**
 * The facts block (ADR 0009 §4): the result values, n, numerators and denominators, the threshold,
 * and the resolved period, each formatted as the UI shows it. The model's sentence may use these
 * numbers and no others.
 */
export function factsFor(result: QueryResult): string[] {
  const words = periodWords(result.requestedSpec.period);
  const lines = [`Metric: ${result.metric.label}. ${result.metric.definition}`, `Period: ${words === undefined ? "" : `${words} = `}${periodPhrase(result)}`];
  const filters = filterList(result.spec.filters).map(({ dimension, values }) => `${DIMENSION_WORDS[dimension].one} is ${values.join(" or ")}`);
  if (filters.length > 0) lines.push(`Filters: ${filters.join("; ")}`);
  if (result.spec.groupBy === undefined) {
    const [row] = result.rows;
    if (row !== undefined) lines.push(`Result: ${detail(result, row)}`);
  } else {
    lines.push(`Result by ${DIMENSION_WORDS[result.spec.groupBy].one}:`);
    lines.push(...result.rows.slice(0, MAX_FACT_ROWS).map((row) => `- ${rowText(result, row)}`));
    if (isCut(result)) {
      lines.push(`Shown: ${result.rows.length} of ${result.totalRows} groups`);
    } else if (result.metric.id === "delivery_outcomes") {
      const totals = outcomeTotals(result);
      lines.push(
        `Total: ${formatCount(totals.delivered)} delivered: ${formatCount(totals.onTime)} on time, ${formatCount(totals.delayed)} delayed, ${formatCount(totals.exception)} exception`,
      );
    } else if (!isRatio(result)) {
      lines.push(`Total: ${formatMetricValue(total(result), result.metric.unit)}`);
    }
  }
  if (result.ranking !== undefined) {
    const { top, topReliable, minDelivered } = result.ranking;
    lines.push(`Top: ${rowText(result, top)}`);
    if (topReliable !== undefined) lines.push(`Top with at least ${minDelivered} delivered orders: ${rowText(result, topReliable)}`);
    if (result.ranking.case === "no-reliable-group") lines.push(`No group has at least ${minDelivered} delivered orders.`);
  }
  if (isRatio(result)) {
    lines.push(`Small-sample threshold: a group needs at least ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders; with fewer it is a small sample`);
  }
  return lines;
}
