import type { TraceStage, TraceStageName } from "@/tools/trace-stage";
import { Fact } from "./text-table";

/** The stages as the strip names them: R7's flow (B5, ADR 0008 §4). */
const STAGE_LABELS: Record<TraceStageName, string> = {
  question: "question",
  interpretation: "interpretation",
  tool: "tool selected",
  computation: "computation",
  result: "result",
  phrasing: "phrasing",
  chart: "chart",
};

function msText(ms: number): string {
  return ms < 1 ? "<1 ms" : `${ms} ms`;
}

/** The pipeline trace: each stage with what happened and its time; a retry, fallback or rewrite stands out. */
export function TraceStrip({ trace }: { trace: readonly TraceStage[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Pipeline trace">
      {trace.map((stage, index) => (
        <li key={stage.stage} className="flex items-center gap-1">
          {index === 0 ? null : (
            <span aria-hidden="true" className="text-slate-400">
              →
            </span>
          )}
          <span
            data-flagged={stage.flagged === true ? "true" : undefined}
            className={
              stage.flagged === true
                ? "rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900"
                : "rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700"
            }
          >
            <span className="font-medium">{STAGE_LABELS[stage.stage]}</span> {stage.detail}
            {stage.ms === undefined ? null : ` · ${msText(stage.ms)}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The explanation panel's "Why this chart" and, when the server sent one, its pipeline trace. */
export function ChartAndTraceFacts({ chartReason, trace }: { chartReason: string; trace?: readonly TraceStage[] }) {
  return (
    <>
      <Fact term="Why this chart">{chartReason}</Fact>
      {trace === undefined ? null : (
        <Fact term="Pipeline">
          <TraceStrip trace={trace} />
        </Fact>
      )}
    </>
  );
}
