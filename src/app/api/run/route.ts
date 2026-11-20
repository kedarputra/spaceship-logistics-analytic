import { z } from "zod";
import { getDataset } from "@/domain/orders";
import { presentAnswer } from "@/tools/answer";
import { runQuery } from "@/tools/query";
import { querySpecSchema } from "@/tools/spec";
import { errorResponse, readJsonBody } from "../body";

/**
 * POST /api/run {spec}: validates a query spec against the whitelist and runs it. Never calls the
 * LLM (ADR 0009 §7); follow-up chips and history re-runs come here.
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
  const result = runQuery(parsed.data.spec, getDataset());
  return Response.json(result.kind === "result" ? presentAnswer(result) : result);
}
