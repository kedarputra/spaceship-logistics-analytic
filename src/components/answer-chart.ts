import type { Answer } from "@/tools/answer";
import { MAX_CATEGORY_BARS } from "@/tools/chart";
import type { ChartProps, ChartRow, ChartSeries } from "./chart";
import { SERIES_COLORS, SMALL_SAMPLE_BLUE } from "./palette";
import { OUTCOME_SERIES, STATUS_SERIES } from "./series";

/**
 * The renderer's input for an answer: the chart type chooseChart picked, applied to the rows.
 * Null for an answer card, which shows the number itself.
 */
export function answerChartProps(answer: Answer): ChartProps | null {
  const { chart, metric, rows } = answer;
  const valueFormat = metric.unit;
  const single: ChartSeries[] = [{ key: "value", label: metric.label, color: SERIES_COLORS.blue, mutedColor: SMALL_SAMPLE_BLUE }];
  const showN = metric.smallSampleRule;

  switch (chart.type) {
    case "answer-card":
      return null;
    case "vertical-bars":
    case "line":
      return {
        type: chart.type,
        series: single,
        rows: rows.map((row) => ({ label: row.label, values: { value: row.value }, muted: row.smallSample })),
        valueFormat,
      };
    case "horizontal-bars":
      return {
        type: chart.type,
        series: single,
        rows: rows.slice(0, MAX_CATEGORY_BARS).map((row) => ({
          label: showN ? `${row.label} (n=${row.n})` : row.label,
          values: { value: row.value },
          muted: row.smallSample,
        })),
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
