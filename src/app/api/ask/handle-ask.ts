import { z } from "zod";
import { AiError } from "@/ai/client";
import type { InterpretationCache } from "@/ai/cache";
import type { InterpretOutcome } from "@/ai/interpret";
import type { PhraseableAnswer, Phrased } from "@/ai/phrase";
import { answerQuery } from "@/tools/answer";
import { EXAMPLE_QUESTIONS, type ExampleId, MAX_QUESTION_LENGTH, UNSUPPORTED_REASONS } from "@/tools/examples";
import { answerForecast } from "@/tools/forecast-answer";
import type { NoDataResult } from "@/tools/query";
import type { Interpretation } from "@/tools/spec";
import { traceStage } from "@/tools/trace";
import type { TraceStage } from "@/tools/trace-stage";
import { errorResponse, readJsonBody } from "../body";
import { cachedPhrasingStage, phrasingStage, pipelineTrace, type Timed, timed } from "../trace";

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
  /** A clock in milliseconds, for the pipeline trace's timings. */
  now: () => number;
}

/** What /api/ask answers with, besides errors; `cached` says whether the interpretation came from the cache. */
type AskAnswer = PhraseableAnswer | NoDataResult | { kind: "unsupported"; message: string; examples: string[] };

/** The interpretation, and the trace stage that says where it came from. */
interface Interpreted {
  interpretation: Interpretation;
  stage: TraceStage;
}

/** The sentence that opens the answer, and the trace stage that says where it came from. */
interface Sentence {
  phrased: Phrased;
  stage: TraceStage;
}

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

function reply(answer: AskAnswer, cached: boolean): Response {
  return Response.json({ ...answer, cached });
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

/** The model's interpretation, or the reply when there is none: the AI's state, or an honest "could not". */
async function interpretByModel(dependencies: AskDependencies, question: string): Promise<Interpreted | Response> {
  let interpreting: Timed<InterpretOutcome>;
  try {
    interpreting = await timed(dependencies.now, () => dependencies.interpret(question));
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    return errorResponse(error.kind === "busy" ? 429 : 503, error.message);
  }
  const { value: outcome, ms } = interpreting;
  if (outcome.kind === "failed") {
    return reply({ kind: "unsupported", message: outcome.message, examples: exampleQuestions(outcome.examples) }, false);
  }
  const stage =
    outcome.attempts === 2
      ? traceStage("interpretation", "by the model, after one retry: the first reply was not a valid spec", { ms, flagged: true })
      : traceStage("interpretation", "by the model", { ms });
  return { interpretation: outcome.interpretation, stage };
}

/** The model's sentence, or the template already on the answer if the phrase step fails outright. */
async function phraseNow(dependencies: AskDependencies, question: string, answer: PhraseableAnswer): Promise<Sentence> {
  const { value: phrased, ms } = await timed(dependencies.now, async (): Promise<Phrased> => {
    try {
      return await dependencies.phrase(question, answer);
    } catch {
      return { sentence: answer.sentence, source: "template", cacheable: false, rejectedBecause: "the phrase step failed" };
    }
  });
  return { phrased, stage: phrasingStage(phrased, ms) };
}

export async function handleAsk(request: Request, dependencies: AskDependencies): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = requestSchema.safeParse(read.body);
  if (!parsed.success) return errorResponse(400, parsed.error.issues[0]?.message ?? "Send a question.");
  const { question } = parsed.data;
  const { now, cache } = dependencies;
  const model = dependencies.modelName();

  const lookup = await timed(now, () => cache.get(question, model));
  const hit = lookup.value;
  const interpreted =
    hit === undefined
      ? await interpretByModel(dependencies, question)
      : { interpretation: hit.interpretation, stage: traceStage("interpretation", "from the cache, no model call", { ms: lookup.ms }) };
  if (interpreted instanceof Response) return interpreted;
  const { interpretation } = interpreted;
  const cached = hit !== undefined;

  const computed = await timed(now, () => answerFor(interpretation));
  const answer = computed.value;
  if (!isPhraseable(answer)) {
    cache.set(question, model, { interpretation });
    return reply(answer, cached);
  }
  // A question cached without its sentence (the phrase call had failed) is phrased again.
  const sentence: Sentence =
    hit?.phrased === undefined ? await phraseNow(dependencies, question, answer) : { phrased: hit.phrased, stage: cachedPhrasingStage(hit.phrased) };
  const { phrased } = sentence;
  cache.set(question, model, phrased.cacheable ? { interpretation, phrased } : { interpretation });
  // An answer with an explanation panel also carries the pipeline trace (B5, ADR 0008 §4).
  const questionStage = traceStage("question", "asked in words");
  const trace = pipelineTrace({ question: questionStage, interpretation: interpreted.stage, phrasing: sentence.stage }, answer, computed.ms);
  return Response.json({ ...withSentence(answer, phrased), cached, trace });
}
