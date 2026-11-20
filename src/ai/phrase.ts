import type { Answer, SentenceSource } from "@/tools/answer";
import { factsFor, requiredNames } from "@/tools/sentence";
import type { LlmClient } from "./client";
import { checkNumbers } from "./guard";
import { phraseMessages } from "./prompts";

/**
 * Result → the answer's opening sentence (ADR 0009 §4). The model writes it at temperature 0.2
 * from the facts block. It is kept only if the number guard passes and it names every group the
 * result requires (ADR 0001 §6, ties); otherwise, or if the call fails, the code template stands,
 * so an answer never waits on, or breaks because of, this call.
 */

export interface Phrased {
  sentence: string;
  source: SentenceSource;
  /** False for a template standing in for a failed call: the next ask should try the model again. */
  cacheable: boolean;
}

const MAX_REPLY_TOKENS = 160;
const MAX_SENTENCE_LENGTH = 400;

/** Whitespace collapsed and any wrapping quotes removed. */
function tidy(reply: string): string {
  return reply
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“](.*)["”]$/, "$1")
    .trim();
}

function namesEveryRequiredGroup(sentence: string, answer: Answer): boolean {
  const text = sentence.toLowerCase();
  return requiredNames(answer).every((name) => text.includes(name.toLowerCase()));
}

export async function phrase(question: string, answer: Answer, client: LlmClient): Promise<Phrased> {
  // The answer arrives carrying its template sentence.
  const template = (cacheable: boolean): Phrased => ({ sentence: answer.sentence, source: "template", cacheable });
  const facts = factsFor(answer);
  let reply: string;
  try {
    reply = await client.complete({ messages: phraseMessages(question, answer, facts), temperature: 0.2, maxTokens: MAX_REPLY_TOKENS });
  } catch {
    return template(false);
  }
  const sentence = tidy(reply);
  if (sentence === "" || sentence.length > MAX_SENTENCE_LENGTH) return template(true);
  if (!checkNumbers(sentence, facts.join("\n")).ok || !namesEveryRequiredGroup(sentence, answer)) return template(true);
  return { sentence, source: "model", cacheable: true };
}
