import { z } from "zod";
import { getDataset } from "@/domain/orders";
import { runQuery } from "@/tools/query";
import { querySpecSchema } from "@/tools/spec";

/**
 * POST /api/run {spec}: validates a query spec against the whitelist and runs it. Never calls the
 * LLM (ADR 0009 §7); follow-up chips and history re-runs come here.
 */

const MAX_BODY_BYTES = 16 * 1024;
const requestSchema = z.strictObject({ spec: querySpecSchema });

function errorResponse(status: number, error: string, issues?: { path: string; message: string }[]): Response {
  return Response.json(issues === undefined ? { error } : { error, issues }, { status });
}

/** The body as text, or null as soon as it passes the limit; a larger body is never read whole. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request): Promise<Response> {
  const tooLarge = () => errorResponse(413, "The request body is over 16 KB.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge();
  const text = await readBody(request, MAX_BODY_BYTES);
  if (text === null) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, "The request body is not valid JSON.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    return errorResponse(400, "The query spec is not valid.", issues);
  }
  return Response.json(runQuery(parsed.data.spec, getDataset()));
}
