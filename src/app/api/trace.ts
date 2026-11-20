import type { PhraseableAnswer, Phrased } from "@/ai/phrase";
import { toolStages, traceStage } from "@/tools/trace";
import type { TraceStage } from "@/tools/trace-stage";

/**
 * The pipeline trace as the routes assemble it (B5, ADR 0008 §4): they time the stages with the
 * clock they are given and add the question, the interpretation and the phrasing around the stages
 * the tools account for.
 */

/** A value with how long it took to produce, in whole milliseconds. */
export interface Timed<T> {
  value: T;
  ms: number;
}

/** Runs `work`, and how long it took by `now`. */
export async function timed<T>(now: () => number, work: () => T | Promise<T>): Promise<Timed<T>> {
  const start = now();
  const value = await work();
  return { value, ms: Math.round(now() - start) };
}

/** The phrase call: the model's sentence kept, or the template and why. */
export function phrasingStage(phrased: Phrased, ms: number): TraceStage {
  if (phrased.source === "model") return traceStage("phrasing", "by the model, guard passed", { ms });
  return traceStage("phrasing", `template: ${phrased.rejectedBecause}`, { ms, flagged: true });
}

/** A sentence the question cache kept, with no phrase call. */
export function cachedPhrasingStage(phrased: Phrased): TraceStage {
  if (phrased.source === "model") return traceStage("phrasing", "sentence from the cache (guard passed)");
  return traceStage("phrasing", `template from the cache: ${phrased.rejectedBecause}`, { flagged: true });
}

/** The stages the route itself accounts for, around the tools' stages. */
export interface RouteStages {
  question: TraceStage;
  interpretation: TraceStage;
  phrasing: TraceStage;
}

/** R7's stages in order: question, interpretation, tool, computation, result, phrasing, chart. */
export function pipelineTrace(routeStages: RouteStages, answer: PhraseableAnswer, computeMs: number): TraceStage[] {
  const tools = toolStages(answer, computeMs);
  return [routeStages.question, routeStages.interpretation, tools.tool, tools.computation, tools.result, routeStages.phrasing, tools.chart];
}
