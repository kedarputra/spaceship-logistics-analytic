import { z } from "zod";
import { answerQuery } from "@/tools/answer";
import { querySpecSchema } from "@/tools/spec";
import { errorResponse, readJsonBody } from "../body";

/**
 * POST /api/run {spec}: validates a query spec against the whitelist and runs it. Never calls the
 * LLM (ADR 0009 §7): the answer opens with the code template sentence. Follow-up chips and history
 * re-runs come here.
 */

const requestSchema = z.strictObject({ spec: querySpecSchema });

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;

  const parsed = requestSchema.safeParse(read.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return errorResponse(400, "The query spec is not valid.", issues);
  }
  return Response.json(answerQuery(parsed.data.spec));
}
