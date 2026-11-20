import type { Interpretation } from "@/tools/spec";
import { PROMPT_VERSION } from "./prompts";

/**
 * The question cache (ADR 0009 §6): one in-memory LRU per server instance, shared by all users,
 * gone on restart. It keeps the validated interpretation; results are always recomputed.
 */

const MAX_ENTRIES = 200;

/** Trimmed, lowercased, spaces collapsed, trailing punctuation of any kind dropped. */
export function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[\s\p{P}]+$/u, "");
}

export interface InterpretationCache {
  get(question: string, model: string): Interpretation | undefined;
  set(question: string, model: string, interpretation: Interpretation): void;
}

export function createInterpretationCache(): InterpretationCache {
  const entries = new Map<string, Interpretation>();
  const keyOf = (question: string, model: string) => JSON.stringify([normalizeQuestion(question), model, PROMPT_VERSION]);
  return {
    get(question, model) {
      const key = keyOf(question, model);
      const hit = entries.get(key);
      if (hit !== undefined) {
        // Re-insert, so the Map's order stays least recently used first.
        entries.delete(key);
        entries.set(key, hit);
      }
      return hit;
    },
    set(question, model, interpretation) {
      const key = keyOf(question, model);
      entries.delete(key);
      entries.set(key, interpretation);
      const oldest = entries.keys().next();
      if (entries.size > MAX_ENTRIES && !oldest.done) entries.delete(oldest.value);
    },
  };
}
