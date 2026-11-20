import type { Answer, SentenceSource } from "@/tools/answer";
import { type ForecastAnswer, forecastFacts, forecastWordingContext, requiredForecastWords } from "@/tools/forecast-answer";
import { factsFor, requiredWords, wordingContext } from "@/tools/sentence";
import type { ChatMessage, Completion, LlmClient } from "./client";
import { checkForecastWording, checkNumbers, checkWording } from "./guard";
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

export interface Phrased {
  sentence: string;
  source: SentenceSource;
  /** False for a template standing in for a failed call: the next ask should try the model again. */
  cacheable: boolean;
}

/** What one phrase call sends, and the checks that depend on the kind of answer. */
interface Brief {
  facts: readonly string[];
  messages: ChatMessage[];
  /** Words the sentence must contain, ignoring case. */
  required: readonly string[];
  /** Wording the number guard cannot see, such as a superlative pointing the wrong way. */
  wordedRight: (sentence: string) => boolean;
}

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
      wordedRight: (sentence) => checkForecastWording(sentence, forecastWordingContext(answer)).ok,
    };
  }
  const facts = factsFor(answer);
  return {
    facts,
    messages: phraseMessages(question, answer, facts),
    required: requiredWords(answer),
    wordedRight: (sentence) => checkWording(sentence, wordingContext(answer)).ok,
  };
}

export async function phrase(question: string, answer: PhraseableAnswer, client: LlmClient): Promise<Phrased> {
  // The answer arrives carrying its template sentence.
  const template = (cacheable: boolean): Phrased => ({ sentence: answer.sentence, source: "template", cacheable });
  const brief = briefFor(question, answer);
  let completion: Completion;
  try {
    completion = await client.complete({ messages: brief.messages, temperature: 0.2, maxTokens: MAX_REPLY_TOKENS });
  } catch {
    return template(false);
  }
  const sentence = tidy(completion.text);
  return isAcceptable(sentence, completion, brief) ? { sentence, source: "model", cacheable: true } : template(true);
}

/**
 * Every word in the sentence, ignoring case, each on its own: a word found inside a longer required
 * one does not count, so "CRAYON-0008" alone does not name the category CRAYON.
 */
function containsEvery(sentence: string, words: readonly string[]): boolean {
  let text = sentence.toLowerCase();
  for (const word of [...words].sort((a, b) => b.length - a.length).map((each) => each.toLowerCase())) {
    if (!text.includes(word)) return false;
    text = text.replaceAll(word, " ");
  }
  return true;
}

/**
 * Whether the model's sentence may open the answer: complete (not cut off by the token limit, ending
 * like a sentence), every number from the facts, every required word in it, and worded the right
 * way round for the result (ticket 22).
 */
function isAcceptable(sentence: string, completion: Completion, brief: Brief): boolean {
  if (completion.finishReason === "length") return false;
  if (sentence === "" || sentence.length > MAX_SENTENCE_LENGTH || !ENDS_LIKE_A_SENTENCE.test(sentence)) return false;
  if (!checkNumbers(sentence, brief.facts.join("\n")).ok || !containsEvery(sentence, brief.required)) return false;
  return brief.wordedRight(sentence);
}
