import { z } from "zod";
import { answerQuery } from "@/tools/answer";
import { answerForecast } from "@/tools/forecast-answer";
import { forecastSpecSchema, querySpecSchema } from "@/tools/spec";
import { traceStage } from "@/tools/trace";
import { errorResponse, readJsonBody } from "../body";
import { pipelineTrace, timed } from "../trace";

/**
 * POST /api/run {spec}: validates a query or forecast spec against the whitelist and runs it. Never
 * calls the LLM (ADR 0009 §7): the answer opens with the code template sentence, and its pipeline
 * trace says so. Follow-up chips and history re-runs come here.
 */

const requestSchema = z.strictObject({ spec: z.discriminatedUnion("tool", [querySpecSchema, forecastSpecSchema]) });

export async function handleRun(request: Request, now: () => number): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;

  const parsed = requestSchema.safeParse(read.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return errorResponse(400, "The query spec is not valid.", issues);
  }
  const { spec } = parsed.data;
  const computed = await timed(now, () => (spec.tool === "forecast" ? answerForecast(spec) : answerQuery(spec)));
  const answer = computed.value;
  if (answer.kind === "no-data") return Response.json(answer);
  const trace = pipelineTrace(
    {
      question: traceStage("question", "a spec sent by a follow-up or a history re-run"),
      interpretation: traceStage("interpretation", "skipped: the spec was sent, no model call"),
      phrasing: traceStage("phrasing", "template, no model call"),
    },
    answer,
    computed.ms,
  );
  return Response.json({ ...answer, trace });
}
