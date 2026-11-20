import { handleRun } from "./handle-run";

/** POST /api/run {spec}: a validated spec run by the tools, never the LLM (ADR 0009 §7). */
export function POST(request: Request): Promise<Response> {
  return handleRun(request, () => performance.now());
}
