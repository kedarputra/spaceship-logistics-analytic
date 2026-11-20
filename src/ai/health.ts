import { AI_ERROR_MESSAGES, AiError } from "./client";

/**
 * The AI health check behind GET /api/health?ai=1 (ADR 0009 §11). `ping` makes a 1-token call that
 * bypasses the question cache and returns the model name the gateway answers with. The answer is
 * remembered for 60 s, so the check costs at most one GPU call a minute, and checks that arrive
 * while a call runs share it.
 */

/** Up, possibly busy: a busy gateway answered, it only had no free slot (other workloads can hold them all, ADR 0010 §8). */
export type AiHealth = { up: true; model: string | undefined; busy?: true } | { up: false; error: string };

const REMEMBER_MS = 60_000;

function healthAfter(error: unknown): AiHealth {
  if (error instanceof AiError && error.kind === "busy") return { up: true, model: undefined, busy: true };
  return { up: false, error: error instanceof AiError ? error.message : AI_ERROR_MESSAGES.unavailable };
}

export function createAiHealthCheck(ping: () => Promise<string | undefined>, now: () => number = Date.now): () => Promise<AiHealth> {
  let last: { at: number; health: Promise<AiHealth> } | undefined;
  return () => {
    const time = now();
    if (last !== undefined && time - last.at < REMEMBER_MS) return last.health;
    const health = ping().then((model): AiHealth => ({ up: true, model }), healthAfter);
    last = { at: time, health };
    return health;
  };
}
