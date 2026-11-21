import type { Interpretation } from "@/tools/spec";
import type { Phrased } from "./phrase";
import { PROMPT_VERSION } from "./prompts";

/**
 * The question cache (ADR 0009 §6): one in-memory LRU per server instance, shared by all users,
 * gone on restart. It keeps the validated interpretation and the guarded sentence, so the same
 * question gets the same answer; the numbers themselves are always recomputed. An entry is kept per
 * dataset (ticket 35): the key holds the dataset's ID, a hash of its content, so a sentence written
 * for one dataset's numbers is never shown with another's.
 */

const MAX_ENTRIES = 200;

/** Trimmed, lowercased, spaces collapsed, trailing punctuation of any kind dropped. */
export function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[\s\p{P}]+$/u, "");
}

export interface CachedQuestion {
  interpretation: Interpretation;
  /** The phrased opening sentence, for a question that had a result to phrase. */
  phrased?: Phrased;
}

export interface InterpretationCache {
  get(question: string, model: string, datasetId: string): CachedQuestion | undefined;
  set(question: string, model: string, datasetId: string, entry: CachedQuestion): void;
}

export function createInterpretationCache(): InterpretationCache {
  const entries = new Map<string, CachedQuestion>();
  const keyOf = (question: string, model: string, datasetId: string) => JSON.stringify([normalizeQuestion(question), model, PROMPT_VERSION, datasetId]);
  return {
    get(question, model, datasetId) {
      const key = keyOf(question, model, datasetId);
      const hit = entries.get(key);
      if (hit !== undefined) {
        // Re-insert, so the Map's order stays least recently used first.
        entries.delete(key);
        entries.set(key, hit);
      }
      return hit;
    },
    set(question, model, datasetId, entry) {
      const key = keyOf(question, model, datasetId);
      entries.delete(key);
      entries.set(key, entry);
      const oldest = entries.keys().next();
      if (entries.size > MAX_ENTRIES && !oldest.done) entries.delete(oldest.value);
    },
  };
}
