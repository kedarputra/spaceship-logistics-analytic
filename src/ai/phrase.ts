import type { Answer } from "@/tools/answer";
import { type ForecastAnswer, forecastFacts, forecastWordingContext, requiredForecastWords } from "@/tools/forecast-answer";
import { factsFor, requiredWords, wordingContext } from "@/tools/sentence";
import { AiError, type AiErrorKind, type ChatMessage, type Completion, type LlmClient } from "./client";
import { checkForecastWording, checkWording, findNumberProblem, type GuardVerdict, type NumberProblem } from "./guard";
import { forecastPhraseMessages, phraseMessages } from "./prompts";

/**
 * Result → the answer's opening sentence (ADR 0009 §4), for a query answer or a forecast. The model
 * writes it at temperature 0.2 from the facts block. It is kept only if it is complete, passes the
 * number guard, contains every word the result requires (the groups of ADR 0001 §6 and ties, or
 * "rough" for a rough forecast) and is worded the right way round; otherwise, or if the call fails,
 * the code template stands, so an answer never waits on, or breaks because of, this call.
 */

/** An answer that opens with a sentence the model may write. */
export type PhraseableAnswer = Answer | ForecastAnswer;

export type Phrased =
  | { sentence: string; source: "model"; cacheable: true }
  | {
      sentence: string;
      source: "template";
      /** False for a template standing in for a failed call: the next ask should try the model again. */
      cacheable: boolean;
      /**
       * Why the template stands, for the pipeline trace (ticket 17). It names the kind of problem,
       * never the model's own words, so no number the model wrote reaches the page.
       */
      rejectedBecause: string;
    };

/** What one phrase call sends, and the checks that depend on the kind of answer. */
interface Brief {
  facts: readonly string[];
  messages: ChatMessage[];
  /** Words the sentence must contain, ignoring case. */
  required: readonly string[];
  /** Wording the number guard cannot see, such as a superlative pointing the wrong way. */
  wordingVerdict: (sentence: string) => GuardVerdict;
}

const FAILED_CALL_REASONS: Record<AiErrorKind, string> = {
  "not-configured": "the AI is not configured",
  busy: "the model was busy",
  unavailable: "the model was unavailable",
};

const NUMBER_PROBLEM_REASONS: Record<NumberProblem["kind"], string> = {
  word: "a number in words or a multiplier",
  invented: "a number not in the facts",
};

const MAX_REPLY_TOKENS = 160;
const MAX_SENTENCE_LENGTH = 400;
const ENDS_LIKE_A_SENTENCE = /[.!?]["”')\]]?$/;

/** Whitespace collapsed and any wrapping quotes removed. */
function tidy(reply: string): string {
  return reply
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“](.*)["”]$/, "$1")
    .trim();
}

function briefFor(question: string, answer: PhraseableAnswer): Brief {
  if (answer.kind === "forecast") {
    const facts = forecastFacts(answer);
    return {
      facts,
      messages: forecastPhraseMessages(question, answer, facts),
      required: requiredForecastWords(answer),
      wordingVerdict: (sentence) => checkForecastWording(sentence, forecastWordingContext(answer)),
    };
  }
  const facts = factsFor(answer);
  return {
    facts,
    messages: phraseMessages(question, answer, facts),
    required: requiredWords(answer),
    wordingVerdict: (sentence) => checkWording(sentence, wordingContext(answer)),
  };
}

/** The answer's template sentence (it arrives carrying one), standing in for the model's. */
function template(answer: PhraseableAnswer, cacheable: boolean, rejectedBecause: string): Phrased {
  return { sentence: answer.sentence, source: "template", cacheable, rejectedBecause };
}

/** The template when the call failed or could not be made, not cached so the next ask tries again. */
export function templateAfterFailedCall(answer: PhraseableAnswer, error: unknown): Phrased {
  return template(answer, false, error instanceof AiError ? FAILED_CALL_REASONS[error.kind] : "the model call failed");
}

export async function phrase(question: string, answer: PhraseableAnswer, client: LlmClient): Promise<Phrased> {
  const brief = briefFor(question, answer);
  let completion: Completion;
  try {
    completion = await client.complete({ messages: brief.messages, temperature: 0.2, maxTokens: MAX_REPLY_TOKENS });
  } catch (error) {
    return templateAfterFailedCall(answer, error);
  }
  const sentence = tidy(completion.text);
  const rejectedBecause = rejection(sentence, completion, brief);
  return rejectedBecause === undefined ? { sentence, source: "model", cacheable: true } : template(answer, true, rejectedBecause);
}

/**
 * The first required word the sentence leaves out, ignoring case, each word on its own: a word found
 * inside a longer required one does not count, so "CRAYON-0008" alone does not name the category CRAYON.
 */
function missingWord(sentence: string, words: readonly string[]): string | undefined {
  let text = sentence.toLowerCase();
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    if (!text.includes(word.toLowerCase())) return word;
    text = text.replaceAll(word.toLowerCase(), " ");
  }
  return undefined;
}

/**
 * Why the model's sentence may not open the answer, or undefined when it may: it must be complete
 * (not cut off by the token limit, ending like a sentence), take every number from the facts,
 * contain every required word, and be worded the right way round for the result (ticket 22).
 */
function rejection(sentence: string, completion: Completion, brief: Brief): string | undefined {
  if (completion.finishReason === "length") return "cut off by the token limit";
  if (sentence === "") return "an empty reply";
  if (sentence.length > MAX_SENTENCE_LENGTH) return `longer than ${MAX_SENTENCE_LENGTH} characters`;
  if (!ENDS_LIKE_A_SENTENCE.test(sentence)) return "does not end like a sentence";
  const numberProblem = findNumberProblem(sentence, brief.facts.join("\n"));
  if (numberProblem !== undefined) return NUMBER_PROBLEM_REASONS[numberProblem.kind];
  const missing = missingWord(sentence, brief.required);
  if (missing !== undefined) return `leaves out "${missing}"`;
  const wording = brief.wordingVerdict(sentence);
  return wording.ok ? undefined : wording.reason;
}
