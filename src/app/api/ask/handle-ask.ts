import { z } from "zod";
import { AiError } from "@/ai/client";
import type { InterpretationCache } from "@/ai/cache";
import type { InterpretOutcome } from "@/ai/interpret";
import type { PhraseableAnswer, Phrased } from "@/ai/phrase";
import { answerQuery } from "@/tools/answer";
import { EXAMPLE_QUESTIONS, type ExampleId, MAX_QUESTION_LENGTH, UNSUPPORTED_REASONS } from "@/tools/examples";
import type { ForecastUnavailable } from "@/tools/forecast";
import { answerForecast } from "@/tools/forecast-answer";
import type { NoDataResult } from "@/tools/query";
import type { Interpretation } from "@/tools/spec";
import { errorResponse, readJsonBody } from "../body";

/**
 * POST /api/ask {question}: the flow of R7. Question → AI interpretation (cached) → tool → computed
 * result → a sentence phrased from the result and checked by the number guard → answer. The model
 * chooses the spec and words the sentence; every number comes from the tools.
 */

export interface AskDependencies {
  interpret: (question: string) => Promise<InterpretOutcome>;
  phrase: (question: string, answer: PhraseableAnswer) => Promise<Phrased>;
  modelName: () => string;
  cache: InterpretationCache;
}

/** What /api/ask answers with, besides errors; `cached` says whether the interpretation came from the cache. */
type AskAnswer = PhraseableAnswer | NoDataResult | ForecastUnavailable | { kind: "unsupported"; message: string; examples: string[] };

const requestSchema = z.strictObject({
  question: z
    .string()
    .trim()
    .min(1, "Ask a question first.")
    .max(MAX_QUESTION_LENGTH, `Questions can be up to ${MAX_QUESTION_LENGTH} characters.`),
});

function exampleQuestions(ids: readonly ExampleId[]): string[] {
  return ids.map((id) => EXAMPLE_QUESTIONS[id]);
}

/** The answer to an interpretation, computed by the tools, with the template sentence. */
function answerFor(interpretation: Interpretation): AskAnswer {
  switch (interpretation.tool) {
    case "query":
      return answerQuery(interpretation);
    case "forecast":
      return answerForecast(interpretation);
    case "unsupported":
      return {
        kind: "unsupported",
        message: UNSUPPORTED_REASONS[interpretation.reason],
        examples: exampleQuestions(interpretation.examples),
      };
  }
}

/** A query answer or a forecast: what opens with a sentence to phrase. */
function isPhraseable(answer: AskAnswer): answer is PhraseableAnswer {
  return answer.kind === "result" || answer.kind === "forecast";
}

function withSentence<T extends PhraseableAnswer>(answer: T, phrased: Phrased): T {
  return { ...answer, sentence: phrased.sentence, sentenceSource: phrased.source };
}

/** The model's sentence, or the template already on the answer if the phrase step fails outright. */
async function phraseSafely(dependencies: AskDependencies, question: string, answer: PhraseableAnswer): Promise<Phrased> {
  try {
    return await dependencies.phrase(question, answer);
  } catch {
    return { sentence: answer.sentence, source: answer.sentenceSource, cacheable: false };
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
  const hit = dependencies.cache.get(question, model);
  if (hit !== undefined) {
    const answer = answerFor(hit.interpretation);
    if (!isPhraseable(answer)) return reply(answer, true);
    // A question cached without its sentence (the phrase call had failed) is phrased again.
    const phrased = hit.phrased ?? (await phraseSafely(dependencies, question, answer));
    if (hit.phrased === undefined && phrased.cacheable) dependencies.cache.set(question, model, { ...hit, phrased });
    return reply(withSentence(answer, phrased), true);
  }

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

  const { interpretation } = outcome;
  const answer = answerFor(interpretation);
  if (!isPhraseable(answer)) {
    dependencies.cache.set(question, model, { interpretation });
    return reply(answer, false);
  }
  const phrased = await phraseSafely(dependencies, question, answer);
  dependencies.cache.set(question, model, phrased.cacheable ? { interpretation, phrased } : { interpretation });
  return reply(withSentence(answer, phrased), false);
}
