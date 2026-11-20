/**
 * The AI's state as the page shows it (ADR 0011 §5), read from GET /api/health?ai=1 (ADR 0009 §11).
 * No imports, so it runs in the browser.
 */

export type AiState = "checking" | "online" | "busy" | "unavailable";

export interface AiStatus {
  state: AiState;
}

export const AI_STATUS_TEXT: Record<AiState, string> = {
  checking: "Checking the AI…",
  online: "AI online",
  busy: "AI busy, try again shortly",
  unavailable: "AI unavailable: the dashboard still works",
};

/** Where the model runs, as the rail says it. */
export function modelOnServer(modelName: string): string {
  return `${modelName} on this server`;
}

/** What the collapsed rail's status dot says on hover: the state, the model, and the data file (ticket 27). */
export function railStatusTip(status: AiStatus, modelName: string, dataFile: string): string {
  return `${AI_STATUS_TEXT[status.state]} · ${modelOnServer(modelName)} · ${dataFile}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The state a health reply describes. A visitor over the rate limit sees busy: they should try again shortly. */
export function aiStatusFrom(httpStatus: number, body: unknown): AiStatus {
  if (httpStatus === 429) return { state: "busy" };
  const ai = isRecord(body) ? body.ai : undefined;
  if (!isRecord(ai) || ai.up !== true) return { state: "unavailable" };
  return ai.busy === true ? { state: "busy" } : { state: "online" };
}
