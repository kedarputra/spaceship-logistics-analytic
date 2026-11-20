import { createInterpretationCache } from "./cache";
import { AiError, createClient, type LlmClient } from "./client";
import { configuredModel, type LlmConfig, readLlmConfig } from "./config";
import { type AiHealth, createAiHealthCheck, modelAnswering } from "./health";
import { type InterpretOutcome, interpret } from "./interpret";
import { type PhraseableAnswer, type Phrased, phrase, templateAfterFailedCall } from "./phrase";

/**
 * The app's one connection to the model. The configuration is read on each question, so a key
 * file added later is picked up; the client, and with it the limit of 2 calls in flight, is shared
 * by every request and replaced only when the configuration changes.
 */

let current: { fingerprint: string; config: LlmConfig; client: LlmClient } | undefined;
let lastProblem: string | undefined;

function connection(): { config: LlmConfig; client: LlmClient } {
  const result = readLlmConfig();
  if (!result.ok) {
    if (result.problem !== lastProblem) console.error(`AI not configured: ${result.problem}.`);
    lastProblem = result.problem;
    throw new AiError("not-configured");
  }
  lastProblem = undefined;
  const { config } = result;
  const fingerprint = JSON.stringify([config.baseUrl, config.model, config.apiKey, config.responseMode]);
  if (current?.fingerprint !== fingerprint) current = { fingerprint, config, client: createClient(config) };
  return current;
}

export function interpretQuestion(question: string): Promise<InterpretOutcome> {
  const { config, client } = connection();
  return interpret(question, client, config.responseMode);
}

/** The answer's sentence from the model, or its template when the AI is not configured or fails. */
export function phraseAnswer(question: string, answer: PhraseableAnswer): Promise<Phrased> {
  let client: LlmClient;
  try {
    client = connection().client;
  } catch (error) {
    return Promise.resolve(templateAfterFailedCall(answer, error));
  }
  return phrase(question, answer, client);
}

/** Whether the AI answers, from a 1-token call made at most once a minute (ADR 0009 §11). */
export const checkAiHealth: () => Promise<AiHealth> = createAiHealthCheck(async () => modelAnswering(connection().client));

/** The configured model name, part of the cache key. */
export function modelName(): string {
  return configuredModel();
}

export const questionCache = createInterpretationCache();
