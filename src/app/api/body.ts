/**
 * Reading a JSON request body under a size limit (ADR 0009 §8). A larger body is refused from its
 * declared length, or as soon as reading passes the limit; it is never read whole.
 */

export const MAX_BODY_BYTES = 16 * 1024;

export function errorResponse(status: number, error: string, issues?: { path: string; message: string }[]): Response {
  return Response.json(issues === undefined ? { error } : { error, issues }, { status });
}

async function readText(request: Request, limit: number): Promise<string | null> {
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

/** The parsed body, or the response that refuses it (413 too large, 400 not JSON). */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const tooLarge = { ok: false as const, response: errorResponse(413, "The request body is over 16 KB.") };
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooLarge;
  const text = await readText(request, MAX_BODY_BYTES);
  if (text === null) return tooLarge;
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: errorResponse(400, "The request body is not valid JSON.") };
  }
}
