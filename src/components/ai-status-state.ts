/**
 * The AI's state as the page shows it (ADR 0011 §5), read from GET /api/health?ai=1 (ADR 0009 §11).
 * No imports, so it runs in the browser.
 */

export type AiState = "checking" | "online" | "busy" | "unavailable";

export interface AiStatus {
  state: AiState;
  /** The model name the gateway answered with, when it gave one. */
  model?: string;
}

export const AI_STATUS_TEXT: Record<AiState, string> = {
  checking: "Checking the AI…",
  online: "AI online",
  busy: "AI busy, try again shortly",
  unavailable: "AI unavailable: the dashboard still works",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The state a health reply describes. A visitor over the rate limit sees busy: they should try again shortly. */
export function aiStatusFrom(httpStatus: number, body: unknown): AiStatus {
  if (httpStatus === 429) return { state: "busy" };
  const ai = isRecord(body) ? body.ai : undefined;
  if (!isRecord(ai) || ai.up !== true) return { state: "unavailable" };
  if (ai.busy === true) return { state: "busy" };
  return typeof ai.model === "string" && ai.model !== "" ? { state: "online", model: ai.model } : { state: "online" };
}
