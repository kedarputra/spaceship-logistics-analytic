import { formatMetricValue } from "@/domain/format";
import type { Answer } from "@/tools/answer";
import { MAX_CATEGORY_BARS } from "@/tools/chart";
import type { ResultRow } from "@/tools/query";
import type { ChartProps, ChartRow } from "./chart";
import type { RankedBar } from "./ranked-bars";
import { OUTCOME_SERIES, singleSeries, STATUS_SERIES } from "./series";

/**
 * For a ranking cut by a limit whose top group is a small sample: the first group with at least 20
 * delivered orders, which the sentence names too (ADR 0001 §6). Undefined when it is already shown.
 */
export function companionOf(answer: Answer): ResultRow | undefined {
  const companion = answer.ranking?.topReliable;
  if (companion === undefined || answer.rows.some((row) => row.key === companion.key)) return undefined;
  return companion;
}

/** The groups of a horizontal-bars answer, at most 12, with the companion added and tagged. */
export function answerBars(answer: Answer): RankedBar[] | null {
  if (answer.chart.type !== "horizontal-bars") return null;
  const { metric, ranking } = answer;
  const bar = (row: ResultRow, tag?: string): RankedBar => ({
    label: row.label,
    n: metric.smallSampleRule ? row.n : undefined,
    value: row.value,
    valueText: formatMetricValue(row.value, metric.unit),
    smallSample: row.smallSample,
    tag,
  });
  const companion = companionOf(answer);
  const bars = answer.rows.slice(0, MAX_CATEGORY_BARS).map((row) => bar(row));
  return companion === undefined || ranking === undefined ? bars : [...bars, bar(companion, `first with n ≥ ${ranking.minDelivered}`)];
}

/**
 * The renderer's input for an answer: the chart type chooseChart picked, applied to the rows. Null for
 * an answer card, which shows the number itself, and for horizontal bars, drawn by answerBars.
 */
export function answerChartProps(answer: Answer): ChartProps | null {
  const { chart, metric, rows } = answer;
  const valueFormat = metric.unit;

  switch (chart.type) {
    case "answer-card":
    case "horizontal-bars":
      return null;
    case "vertical-bars":
    case "line":
      return {
        type: chart.type,
        series: [singleSeries(metric.id, metric.label)],
        rows: rows.map((row) => ({ label: row.label, values: { value: row.value }, muted: row.smallSample })),
        valueFormat,
      };
    case "stacked-bars": {
      if (metric.id === "delivery_outcomes") {
        const stacked: ChartRow[] = rows.map((row) => ({
          label: row.label,
          values: Object.fromEntries(OUTCOME_SERIES.map(({ key }) => [key, row.outcomes?.[key] ?? 0])),
        }));
        return { type: chart.type, series: OUTCOME_SERIES, rows: stacked, valueFormat };
      }
      // A status breakdown: one bar, split into the statuses that have orders.
      const present = STATUS_SERIES.filter(({ key }) => rows.some((row) => row.key === key));
      const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      return { type: chart.type, series: present, rows: [{ label: metric.label, values }], valueFormat };
    }
  }
}
