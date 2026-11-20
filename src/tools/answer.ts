import { type ChartType, chooseChart, MAX_CATEGORY_BARS } from "./chart";
import { getDataset } from "@/domain/orders";
import { type NoDataResult, type QueryResult, runQuery } from "./query";
import { templateSentence } from "./sentence";
import { ASSUMED_METRIC, type GroupBy, isCategoryBreakdown, isTimeDimension, type QuerySpec } from "./spec";
import { DIMENSION_WORDS, dateFieldWords, filterList, MONTH_NAMES } from "./words";

/**
 * What an answer shows besides the numbers, all written by code from the spec and the result:
 * the interpretation in words, the chart type, and the follow-up chips (ADR 0006 §6–8). The LLM
 * neither writes these nor sees them as instructions.
 */

export interface AnswerChart {
  type: ChartType;
  /** Category rows past the chart's 12 bars; the table shows them all. */
  hiddenRows: number;
}

/** A chip that runs a variant of the answer through /api/run. */
export interface FollowUp {
  label: string;
  spec: QuerySpec;
}

/** Who wrote an answer's opening sentence. */
export type SentenceSource = "model" | "template";

export interface Answer extends QueryResult {
  /** The opening sentence: the model's when it passed the number guard, otherwise the code template. */
  sentence: string;
  sentenceSource: SentenceSource;
  interpretation: string;
  /** How an ambiguous word in the question was read, when a default was applied (ADR 0006 §8). */
  assumptionNote?: string;
  chart: AnswerChart;
  followUps: FollowUp[];
}

const ASSUMPTION_NOTES: Record<NonNullable<QuerySpec["assumption"]>, string> = {
  best: '"Best" is read as the highest on-time delivery rate.',
  performance: '"Performance" is read as the on-time delivery rate.',
  late: '"Late" is read as delayed orders; exception orders are counted separately.',
};

/**
 * The note describes what was computed. The model tags "worst" and "least reliable" questions with
 * the same "best" assumption but sorts them ascending, so the note follows the sort, not the tag.
 */
function assumptionNote(spec: QuerySpec): string | undefined {
  if (spec.assumption === undefined) return undefined;
  if (spec.assumption === "best" && spec.sort === "asc") return "The worst is read as the lowest on-time delivery rate.";
  return ASSUMPTION_NOTES[spec.assumption];
}

/** "Delay rate by carrier, highest first, top 1, 1 Jan–31 Dec 2025 by delivery date." */
export function describeQuery(result: QueryResult): string {
  const { spec } = result;
  const parts = [spec.groupBy === undefined ? result.metric.label : `${result.metric.label} by ${DIMENSION_WORDS[spec.groupBy].one}`];
  // The query tool sorts categories by value and time by date unless told otherwise.
  if (spec.sort !== undefined || isCategoryBreakdown(spec.groupBy)) parts.push(spec.sort === "asc" ? "lowest first" : "highest first");
  if (spec.limit !== undefined) parts.push(`top ${spec.limit}`);
  parts.push(`${result.period.label} by ${dateFieldWords(result.dateField)}`);
  const filters = filterList(spec.filters).map(({ dimension, values }) => `${DIMENSION_WORDS[dimension].one} is ${values.join(" or ")}`);
  if (filters.length > 0) parts.push(`where ${filters.join(" and ")}`);
  if (spec.minDelivered !== undefined) parts.push(`only groups with at least ${spec.minDelivered} delivered orders`);
  return `${parts.join(", ")}.`;
}

function dimensionKind(groupBy: GroupBy | undefined): "none" | "time" | "category" {
  if (groupBy === undefined) return "none";
  return isTimeDimension(groupBy) ? "time" : "category";
}

/** ADR 0006 §6: the chart follows the shape of the result. */
export function chartFor(result: QueryResult): AnswerChart {
  const { groupBy } = result.spec;
  const kind = result.metric.kind;
  const measure = kind === "rate" || kind === "average" ? kind : "count";
  const shareOfWhole = result.metric.id === "delivery_outcomes" || (groupBy === "status" && measure === "count");
  const type = chooseChart({ dimension: dimensionKind(groupBy), measure, shareOfWhole });
  return { type, hiddenRows: type === "horizontal-bars" ? Math.max(0, result.rows.length - MAX_CATEGORY_BARS) : 0 };
}

/** The same question for another metric. A category ranking turns around, so "best" stays best; time keeps its order. */
function withMetric(spec: QuerySpec, metric: QuerySpec["metric"]): QuerySpec {
  const { sort, assumption: _answered, ...rest } = spec;
  if (!isCategoryBreakdown(spec.groupBy)) return sort === undefined ? { ...rest, metric } : { ...rest, metric, sort };
  return { ...rest, metric, sort: sort === "asc" ? "desc" : "asc" };
}

export function followUpsFor(result: QueryResult): FollowUp[] {
  const { spec, ranking } = result;
  const followUps: FollowUp[] = [];

  // ADR 0002 §3: "last month" is a month before the data ends; offer the anchor's month.
  if (spec.period?.type === "previous" && spec.period.unit === "month") {
    const [year, month] = result.coverage.to.split("-");
    followUps.push({
      label: `${MONTH_NAMES[Number(month) - 1]} ${year} instead?`,
      spec: { ...spec, period: { type: "this", unit: "month" } },
    });
  }

  // ADR 0001 §6: the top group is a small sample and a reliable one exists.
  if (ranking?.case === "small-sample-top" && spec.groupBy !== undefined) {
    followUps.push({
      label: `Only ${DIMENSION_WORDS[spec.groupBy].many} with ≥ ${ranking.minDelivered} deliveries`,
      spec: { ...spec, minDelivered: ranking.minDelivered },
    });
  }

  // ADR 0006 §8: when an ambiguous word was read with its default, offer the other readings.
  const assumed = spec.assumption === undefined ? undefined : ASSUMED_METRIC[spec.assumption];
  if (assumed === "on_time_rate") {
    followUps.push({ label: "Delay rate instead?", spec: withMetric(spec, "delay_rate") });
    followUps.push({ label: "Average delivery time instead?", spec: withMetric(spec, "average_delivery_time") });
  }
  if (assumed === "delayed_orders") {
    const { assumption: _answered, ...rest } = spec;
    followUps.push({
      label: "Count exception orders too?",
      spec: { ...rest, metric: "order_count", filters: { ...spec.filters, status: ["delayed", "exception"] } },
    });
  }
  return followUps;
}

/** A validated spec, run over the dataset and presented: what /api/run and /api/ask both answer with. */
export function answerQuery(spec: QuerySpec): Answer | NoDataResult {
  const result = runQuery(spec, getDataset());
  return result.kind === "result" ? presentAnswer(result) : result;
}

export function presentAnswer(result: QueryResult): Answer {
  return {
    ...result,
    sentence: templateSentence(result),
    sentenceSource: "template",
    interpretation: describeQuery(result),
    assumptionNote: assumptionNote(result.spec),
    chart: chartFor(result),
    followUps: followUpsFor(result),
  };
}
