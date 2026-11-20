import type { Answer } from "./answer";
import { CHART_NAMES } from "./chart";
import type { ForecastAnswer } from "./forecast-answer";
import { isTimeDimension } from "./spec";
import type { TraceStage, TraceStageName } from "./trace-stage";
import { countOf, DIMENSION_WORDS } from "./words";

/**
 * The pipeline trace (B5, ADR 0008 §4): R7's flow as stages, each with what happened and, where it
 * takes measurable time, how long. The routes time the stages and add the question, the
 * interpretation and the phrasing; this module describes the stages the tools account for.
 */

export function traceStage(stage: TraceStageName, detail: string, extra: { ms?: number; flagged?: boolean } = {}): TraceStage {
  return {
    stage,
    detail,
    ...(extra.ms === undefined ? {} : { ms: extra.ms }),
    ...(extra.flagged === true ? { flagged: true } : {}),
  };
}

/** "1 value", "14 weeks", "1 of 9 carriers shown". */
function resultSize(answer: Answer): string {
  const { groupBy } = answer.spec;
  if (groupBy === undefined) return "1 value";
  const words = DIMENSION_WORDS[groupBy];
  const shown = answer.rows.length;
  if (!isTimeDimension(groupBy) && shown < answer.totalRows) return `${shown} of ${answer.totalRows} ${words.many} shown`;
  return `${shown} ${shown === 1 ? words.one : words.many}`;
}

function queryStages(answer: Answer, computeMs: number) {
  const { rewrite, chart } = answer;
  const computation =
    rewrite === undefined
      ? traceStage("computation", "computed in code", { ms: computeMs })
      : traceStage("computation", `status rewrite: ${rewrite.from} → ${rewrite.to}`, { ms: computeMs, flagged: true });
  const hidden = chart.hiddenRows > 0 ? `, ${chart.hiddenRows} more in the table` : "";
  return {
    tool: traceStage("tool", `query tool: ${answer.metric.label.toLowerCase()}`),
    computation,
    result: traceStage("result", resultSize(answer)),
    chart: traceStage("chart", `${CHART_NAMES[chart.type]}${hidden}`),
  };
}

function forecastStages(answer: ForecastAnswer, computeMs: number) {
  const months = `${countOf(answer.horizon.months, "month")} forecast`;
  return {
    tool: traceStage("tool", `forecast tool: ${answer.scopeLabel}`),
    computation: traceStage("computation", `${answer.method.label} chosen on ${answer.holdout}`, { ms: computeMs }),
    result: answer.method.rough ? traceStage("result", `${months}, rough`, { flagged: true }) : traceStage("result", months),
    chart: traceStage("chart", "history and forecast line"),
  };
}

/** The tool selected, the computation and how long it took, the result's size, and the chart. */
export function toolStages(answer: Answer | ForecastAnswer, computeMs: number): Record<"tool" | "computation" | "result" | "chart", TraceStage> {
  return answer.kind === "forecast" ? forecastStages(answer, computeMs) : queryStages(answer, computeMs);
}
