import type { LlmConfig } from "./config";

/**
 * The model client (ADR 0009 §2, §5, §9): plain fetch to the gateway's /chat/completions, 15 s
 * per call, no transport retries, at most 2 calls in flight, and every failure turned into one
 * of three messages the user can act on.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type AiErrorKind = "not-configured" | "busy" | "unavailable";

export const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  "not-configured": "AI not configured, so questions cannot be answered. The dashboard still works.",
  busy: "The AI is busy, try again shortly.",
  unavailable: "AI unavailable right now. The dashboard still works.",
};

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** The gateway's HTTP status, when it answered with an error. */
  readonly status: number | undefined;

  constructor(kind: AiErrorKind, status?: number) {
    super(AI_ERROR_MESSAGES[kind]);
    this.name = "AiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ResponseFormat =
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; schema: unknown; strict: boolean } };

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature: number;
  responseFormat?: ResponseFormat;
  maxTokens?: number;
}

export interface Completion {
  text: string;
  /** "stop" when the model finished; "length" when the token limit cut it off. */
  finishReason: string | undefined;
}

export interface LlmClient {
  /** The assistant message. Throws AiError. */
  complete(request: CompletionRequest): Promise<Completion>;
}

interface ClientOptions {
  fetch?: FetchLike;
  log?: (message: string) => void;
}

const TIMEOUT_MS = 15_000;
const MAX_IN_FLIGHT = 2;
const SLOT_WAIT_MS = 10_000;

/** At most `max` calls at once; a caller that waits longer than `waitMs` for a slot gets "busy". */
function createSlots(max: number, waitMs: number) {
  let inFlight = 0;
  const waiting: { grant: () => void }[] = [];

  function release() {
    const next = waiting.shift();
    if (next === undefined) inFlight -= 1;
    else next.grant();
  }

  function acquire(): Promise<() => void> {
    if (inFlight < max) {
      inFlight += 1;
      return Promise.resolve(release);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(waiter), 1);
        reject(new AiError("busy"));
      }, waitMs);
      const waiter = {
        grant: () => {
          clearTimeout(timer);
          resolve(release);
        },
      };
      waiting.push(waiter);
    });
  }

  return { acquire };
}

function completionOf(body: unknown): Completion | undefined {
  if (typeof body !== "object" || body === null || !("choices" in body) || !Array.isArray(body.choices)) return undefined;
  const [choice]: unknown[] = body.choices;
  if (typeof choice !== "object" || choice === null || !("message" in choice)) return undefined;
  const { message } = choice;
  if (typeof message !== "object" || message === null || !("content" in message) || typeof message.content !== "string") return undefined;
  const finishReason = "finish_reason" in choice && typeof choice.finish_reason === "string" ? choice.finish_reason : undefined;
  return { text: message.content, finishReason };
}

export function createClient(config: LlmConfig, options: ClientOptions = {}): LlmClient {
  const fetchImpl = options.fetch ?? fetch;
  const log = options.log ?? ((message: string) => console.error(message));
  const slots = createSlots(MAX_IN_FLIGHT, SLOT_WAIT_MS);

  async function send(request: CompletionRequest): Promise<Completion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages: request.messages,
          temperature: request.temperature,
          response_format: request.responseFormat,
          max_tokens: request.maxTokens,
        }),
        signal: controller.signal,
      });
      if (response.status === 429) throw new AiError("busy", response.status);
      if (response.status === 401 || response.status === 403) {
        log(`The LLM gateway refused the key (HTTP ${response.status}).`);
        throw new AiError("not-configured", response.status);
      }
      if (!response.ok) throw new AiError("unavailable", response.status);
      const completion = completionOf(await response.json());
      if (completion === undefined) throw new AiError("unavailable");
      return completion;
    } catch (error) {
      // A refused connection, a timeout, or a reply that is not JSON.
      throw error instanceof AiError ? error : new AiError("unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async complete(request) {
      const release = await slots.acquire();
      try {
        return await send(request);
      } finally {
        release();
      }
    },
  };
}
