import { type ExampleId, UNINTERPRETABLE } from "@/tools/examples";
import { type Interpretation, interpretationSchema } from "@/tools/spec";
import type { ChatMessage, LlmClient, ResponseFormat } from "./client";
import type { ResponseMode } from "./config";
import { interpretationJsonSchema, interpretMessages, retryMessages } from "./prompts";

/**
 * Question → validated interpretation (ADR 0009 §3). One structured output at temperature 0; an
 * invalid reply gets one retry that carries the validation error; after that, an honest error with
 * example questions. Gateway errors (AiError) are left to the caller.
 */

export type InterpretOutcome =
  | { kind: "interpreted"; interpretation: Interpretation; attempts: 1 | 2 }
  | { kind: "failed"; message: string; examples: ExampleId[] };

const FALLBACK_EXAMPLES: ExampleId[] = ["late_last_month", "delayed_by_week", "highest_delay_rate"];
const MAX_REPLY_TOKENS = 600;

type ParsedReply = { ok: true; interpretation: Interpretation } | { ok: false; problems: string[] };

/** The reply as an interpretation, or what is wrong with it, in words the model can fix. */
function parseReply(reply: string): ParsedReply {
  const text = reply
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["The reply is not valid JSON."] };
  }
  const result = interpretationSchema.safeParse(json);
  if (result.success) return { ok: true, interpretation: result.data };
  return { ok: false, problems: result.error.issues.map((issue) => `${issue.path.join(".") || "(top level)"}: ${issue.message}`) };
}

/**
 * The honest error after the retry. A value that is not in the data is said plainly (ADR 0006 §4);
 * anything else gets the general message.
 */
function failure(problems: readonly string[]): Extract<InterpretOutcome, { kind: "failed" }> {
  const unknownValues = problems.map((problem) => problem.slice(problem.indexOf(": ") + 2)).filter((message) => message.startsWith("Unknown "));
  return { kind: "failed", message: unknownValues.length > 0 ? unknownValues.join(" ") : UNINTERPRETABLE, examples: FALLBACK_EXAMPLES };
}

function responseFormat(mode: ResponseMode): ResponseFormat {
  if (mode === "json_object") return { type: "json_object" };
  return { type: "json_schema", json_schema: { name: "interpretation", schema: interpretationJsonSchema(), strict: true } };
}

export async function interpret(question: string, client: LlmClient, mode: ResponseMode): Promise<InterpretOutcome> {
  const ask = async (messages: ChatMessage[]): Promise<string> =>
    (await client.complete({ messages, temperature: 0, responseFormat: responseFormat(mode), maxTokens: MAX_REPLY_TOKENS })).text;

  const first = await ask(interpretMessages(question));
  const firstParsed = parseReply(first);
  if (firstParsed.ok) return { kind: "interpreted", interpretation: firstParsed.interpretation, attempts: 1 };

  const secondParsed = parseReply(await ask(retryMessages(question, first, firstParsed.problems)));
  if (secondParsed.ok) return { kind: "interpreted", interpretation: secondParsed.interpretation, attempts: 2 };
  return failure(secondParsed.problems);
}
