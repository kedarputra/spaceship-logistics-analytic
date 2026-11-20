import { z } from "zod";
import { AiError } from "@/ai/client";
import type { InterpretationCache } from "@/ai/cache";
import type { InterpretOutcome } from "@/ai/interpret";
import { getDataset } from "@/domain/orders";
import { type Answer, presentAnswer } from "@/tools/answer";
import { EXAMPLE_QUESTIONS, type ExampleId, MAX_QUESTION_LENGTH, UNSUPPORTED_REASONS } from "@/tools/examples";
import { type NoDataResult, runQuery } from "@/tools/query";
import type { Interpretation } from "@/tools/spec";
import { errorResponse, readJsonBody } from "../body";

/**
 * POST /api/ask {question}: the flow of R7. Question → AI interpretation (cached) → tool → computed
 * result → answer. The model only chooses and fills in the spec; every number comes from the tools.
 */

export interface AskDependencies {
  interpret: (question: string) => Promise<InterpretOutcome>;
  modelName: () => string;
  cache: InterpretationCache;
}

/** What /api/ask answers with, besides errors; `cached` says whether the interpretation came from the cache. */
type AskAnswer =
  | Answer
  | NoDataResult
  | { kind: "unavailable"; message: string }
  | { kind: "unsupported"; message: string; examples: string[] };

const requestSchema = z.strictObject({
  question: z
    .string()
    .trim()
    .min(1, "Ask a question first.")
    .max(MAX_QUESTION_LENGTH, `Questions can be up to ${MAX_QUESTION_LENGTH} characters.`),
});

const FORECAST_NOT_AVAILABLE = "Demand forecasts are not available yet. Questions about past orders work.";

function exampleQuestions(ids: readonly ExampleId[]): string[] {
  return ids.map((id) => EXAMPLE_QUESTIONS[id]);
}

/** The answer to an interpretation, computed by the tools. */
function answerFor(interpretation: Interpretation): AskAnswer {
  switch (interpretation.tool) {
    case "query": {
      const result = runQuery(interpretation, getDataset());
      return result.kind === "result" ? presentAnswer(result) : result;
    }
    case "forecast":
      return { kind: "unavailable", message: FORECAST_NOT_AVAILABLE };
    case "unsupported":
      return {
        kind: "unsupported",
        message: UNSUPPORTED_REASONS[interpretation.reason],
        examples: exampleQuestions(interpretation.examples),
      };
  }
}

export async function handleAsk(request: Request, dependencies: AskDependencies): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = requestSchema.safeParse(read.body);
  if (!parsed.success) return errorResponse(400, parsed.error.issues[0]?.message ?? "Send a question.");
  const { question } = parsed.data;

  const reply = (answer: AskAnswer, cached: boolean) => Response.json({ ...answer, cached });
  const model = dependencies.modelName();
  const cached = dependencies.cache.get(question, model);
  if (cached !== undefined) return reply(answerFor(cached), true);

  let outcome: InterpretOutcome;
  try {
    outcome = await dependencies.interpret(question);
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    return errorResponse(error.kind === "busy" ? 429 : 503, error.message);
  }
  if (outcome.kind === "failed") {
    return reply({ kind: "unsupported", message: outcome.message, examples: exampleQuestions(outcome.examples) }, false);
  }
  dependencies.cache.set(question, model, outcome.interpretation);
  return reply(answerFor(outcome.interpretation), false);
}
