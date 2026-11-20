import { isRateOrAverage, SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatCount, formatMetricValue } from "@/domain/format";
import { formatPeriod } from "@/domain/periods";
import type { Direction, QueryResult, ResultRow, RowValues } from "./query";
import { type GroupBy, isTimeDimension } from "./spec";
import { andList, DIMENSION_WORDS, dateFieldWords, filterList, periodWords } from "./words";

/**
 * The answer's opening sentence, written by code (ADR 0009 §4), and the facts block the model's
 * sentence is checked against. Both are built from the same formatted values, so every number a
 * template uses is in the facts, exactly as the UI shows it. /api/run answers with the template;
 * /api/ask uses it whenever the model's sentence is rejected or the phrase call fails.
 */

const MAX_FACT_ROWS = 60;

function isRatio(result: QueryResult): boolean {
  return isRateOrAverage(result.metric.kind);
}

function value(result: QueryResult, row: RowValues): string {
  return formatMetricValue(row.value, result.metric.unit);
}

/**
 * "25.0% (2 of 8)" for a rate, "3.8 days over 370 deliveries" for an average, "15" for a count.
 * For a small sample, its size is stressed once: "on only 8 deliveries" or "over only 8 deliveries".
 */
function detail(result: QueryResult, row: RowValues, stressSmall = false): string {
  const only = stressSmall ? "only " : "";
  if (result.metric.kind === "average") return `${value(result, row)} over ${only}${formatCount(row.n)} deliveries`;
  if (result.metric.kind === "rate" && row.numerator !== undefined && row.denominator !== undefined) {
    const parts = `${value(result, row)} (${formatCount(row.numerator)} of ${formatCount(row.denominator)})`;
    return stressSmall ? `${parts} on only ${formatCount(row.n)} deliveries` : parts;
  }
  return value(result, row);
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
function extremes(rows: readonly ResultRow[], direction: Direction): ResultRow[] {
  const values = rows.flatMap((row) => (row.value === null ? [] : [row.value]));
  if (values.length === 0) return [];
  const target = direction === "highest" ? Math.max(...values) : Math.min(...values);
  return rows.filter((row) => row.value === target);
}

/** True when a limit dropped rows, so the rows kept are not every group. */
function isCut(result: QueryResult): boolean {
  return result.rows.length < result.totalRows;
}

/**
 * The direction of the leaders when a limit cut a result ordered by value: the rows kept are then
 * only the highest (or lowest), and a sentence must not describe them the other way round.
 */
export function cutRankingDirection(result: QueryResult): Direction | undefined {
  return isCut(result) ? result.order : undefined;
}

/** What the wording check needs to know about a result (ticket 22). */
export function wordingContext(result: QueryResult): { direction: Direction | undefined; countLike: boolean } {
  return { direction: cutRankingDirection(result), countLike: result.metric.kind === "count" || result.metric.kind === "sum" };
}

/** "370 delivered, 304 on time, 55 delayed and 11 exception", from the metric over the whole period. */
function outcomesText(overall: RowValues): string {
  const outcomes = overall.outcomes;
  if (outcomes === undefined) return `${formatCount(overall.value ?? 0)} delivered`;
  return `${formatCount(overall.value ?? 0)} delivered, ${formatCount(outcomes.onTime)} on time, ${formatCount(outcomes.delayed)} delayed and ${formatCount(outcomes.exception)} exception`;
}

/**
 * The overall figure worth stating: the metric over the whole period, except a share of orders
 * with no filter, which is every order out of every order.
 */
function statedOverall(result: QueryResult): RowValues | undefined {
  if (result.metric.id === "order_share" && filterList(result.spec.filters).length === 0) return undefined;
  return result.overall;
}

/**
 * The extremes of a series over time, decided by code (ADR 0001 §6): for a rate or average, only
 * among the points with at least 20 deliveries; for a count, the peak.
 */
function seriesExtremes(result: QueryResult): { highest: ResultRow[]; lowest: ResultRow[]; reliableOnly: boolean } {
  const filtered = result.metric.smallSampleRule ? result.rows.filter((row) => !row.smallSample) : result.rows;
  return {
    highest: extremes(filtered, "highest"),
    lowest: extremes(filtered, "lowest"),
    reliableOnly: filtered.length < result.rows.length,
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
function rankingWords(result: QueryResult): { leader: string; direction: Direction } {
  const direction = result.order ?? "highest";
  const countLike = result.metric.unit === "orders" || result.metric.unit === "units";
  if (countLike) return { leader: direction === "lowest" ? "Fewest" : "Most", direction };
  return { leader: capitalized(direction), direction };
}

function categorySentence(result: QueryResult, groupBy: GroupBy): string {
  const metric = lowered(result.metric.label);
  const words = rankingWords(result);
  const { ranking } = result;
  if (ranking === undefined) {
    const top = tiedFirst(result.rows);
    if (top[0] === undefined) return `No ${DIMENSION_WORDS[groupBy].many} in ${periodPhrase(result)}.`;
    const each = top.length > 1 ? " each" : "";
    return `${words.leader} ${metric}: ${andList(top.map((row) => row.label))}, with ${detail(result, top[0])}${each}.`;
  }
  const { top, topReliable, minDelivered } = ranking;
  const heading = `${capitalized(words.direction)} ${metric}`;
  switch (ranking.case) {
    case "reliable":
      return `${heading}: ${andList(tiedFirst(result.rows).map((row) => `${row.label} ${detail(result, row)}`))}.`;
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
  const overall = statedOverall(result);
  if (result.metric.id === "delivery_outcomes") {
    return `Delivery outcomes by ${unit.one}, ${periodPhrase(result)}: ${overall === undefined ? "none" : outcomesText(overall)}.`;
  }
  const { highest, lowest, reliableOnly } = seriesExtremes(result);
  if (isRatio(result)) {
    const overallText = overall === undefined ? "" : `${detail(result, overall)} overall; `;
    if (highest[0] === undefined || lowest[0] === undefined) {
      return `${heading}: ${overallText}no ${unit.one} has at least ${SMALL_SAMPLE_MIN_DELIVERED} deliveries, so no ${unit.one} stands out reliably.`;
    }
    const among = reliableOnly ? `, among ${unit.many} with at least ${SMALL_SAMPLE_MIN_DELIVERED} deliveries` : "";
    return `${heading}: ${overallText}highest in ${andList(highest.map((row) => row.label))} (${value(result, highest[0])}), lowest in ${andList(lowest.map((row) => row.label))} (${value(result, lowest[0])})${among}.`;
  }
  if (highest[0] === undefined || highest[0].value === 0) return `${heading}: none.`;
  const each = highest.length > 1 ? " each" : "";
  const inAll = overall === undefined ? "" : `${value(result, overall)} in all; `;
  return `${heading}: ${inAll}the most in ${andList(highest.map((row) => row.label))} (${value(result, highest[0])}${each}).`;
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

/** The series' extremes as facts, so the model names the ones code chose (ADR 0001 §6). */
function seriesFacts(result: QueryResult, groupBy: GroupBy): string[] {
  if (result.metric.id === "delivery_outcomes") return [];
  const { highest, lowest, reliableOnly } = seriesExtremes(result);
  const [high] = highest;
  const [low] = lowest;
  if (high === undefined || low === undefined) return [];
  if (!isRatio(result)) {
    const each = highest.length > 1 ? " each" : "";
    return [`Most: ${andList(highest.map((row) => row.label))} (${value(result, high)}${each})`];
  }
  const unit = DIMENSION_WORDS[groupBy].one;
  const among = reliableOnly ? ` with at least ${SMALL_SAMPLE_MIN_DELIVERED} deliveries` : "";
  return [
    `Highest ${unit}${among}: ${andList(highest.map((row) => row.label))} (${value(result, high)})`,
    `Lowest ${unit}${among}: ${andList(lowest.map((row) => row.label))} (${value(result, low)})`,
  ];
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
  const groupBy = result.spec.groupBy;
  if (groupBy === undefined) {
    const [row] = result.rows;
    if (row !== undefined) lines.push(`Result: ${detail(result, row)}`);
  } else {
    lines.push(`Result by ${DIMENSION_WORDS[groupBy].one}:`);
    if (result.order !== undefined) lines.push(`Order: ${result.order} first`);
    lines.push(...result.rows.slice(0, MAX_FACT_ROWS).map((row) => `- ${rowText(result, row)}`));
    if (isCut(result)) lines.push(`Shown: ${result.rows.length} of ${result.totalRows} groups`);
    const overall = statedOverall(result);
    if (overall !== undefined) {
      if (result.metric.id === "delivery_outcomes") lines.push(`Total: ${outcomesText(overall)}`);
      else if (isRatio(result)) lines.push(`Overall: ${detail(result, overall)}`);
      else lines.push(`Total: ${value(result, overall)}`);
    }
    if (isTimeDimension(groupBy)) lines.push(...seriesFacts(result, groupBy));
  }
  if (result.ranking !== undefined) {
    const { top, topReliable, minDelivered } = result.ranking;
    lines.push(`Top: ${rowText(result, top)}`);
    if (topReliable !== undefined) lines.push(`Top with at least ${minDelivered} delivered orders: ${rowText(result, topReliable)}`);
    if (result.ranking.case === "no-reliable-group") lines.push(`No group has at least ${minDelivered} delivered orders.`);
  }
  if (result.metric.smallSampleRule) {
    lines.push(`Small-sample threshold: a group needs at least ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders; with fewer it is a small sample`);
  }
  return lines;
}
