/**
 * The shape of a pipeline trace stage (B5, ADR 0008 §4), with no imports, so the browser can check a
 * trace in a reply without loading the dataset.
 */

export const TRACE_STAGES = ["question", "interpretation", "tool", "computation", "result", "phrasing", "chart"] as const;

export type TraceStageName = (typeof TRACE_STAGES)[number];

export interface TraceStage {
  stage: TraceStageName;
  /** What happened, in a few words: "from the cache, no model call", "status rewrite: …", "template: …". */
  detail: string;
  /** Milliseconds, for a stage that takes measurable time. */
  ms?: number;
  /** Something worth noticing: a retry, a template fallback, a status rewrite, a rough forecast. */
  flagged?: true;
}
