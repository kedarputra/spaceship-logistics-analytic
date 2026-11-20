import { readFileSync } from "node:fs";

/**
 * Where the LLM is and how to call it (ADR 0009 §1). The model id and the key never appear in
 * code: the gateway's model name comes from LLM_MODEL and the key from the file LLM_API_KEY_FILE
 * names. Without a key file the AI is "not configured" and the rest of the app still works.
 */

export type ResponseMode = "json_object" | "json_schema";

/**
 * json_schema has the gateway constrain the reply to the schema. `npm run smoke:llm` showed on
 * 20 Nov 2026 that the server's gateway enforces it (ticket 11). json_object, with the schema in
 * the prompt, is the fallback for a gateway that does not.
 */
export const DEFAULT_RESPONSE_MODE: ResponseMode = "json_schema";

const DEFAULT_BASE_URL = "http://127.0.0.1:4000/v1";
const DEFAULT_MODEL = "chat";

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  responseMode: ResponseMode;
}

export type LlmConfigResult = { ok: true; config: LlmConfig } | { ok: false; problem: string };

type Environment = Record<string, string | undefined>;

/** The model name alone, without reading the key file: part of the question cache's key. */
export function configuredModel(env: Environment = process.env): string {
  return env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

export function readLlmConfig(
  env: Environment = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): LlmConfigResult {
  const keyFile = env.LLM_API_KEY_FILE?.trim();
  if (!keyFile) return { ok: false, problem: "LLM_API_KEY_FILE is not set" };
  let apiKey: string;
  try {
    apiKey = readFile(keyFile).trim();
  } catch {
    return { ok: false, problem: "The file LLM_API_KEY_FILE names cannot be read" };
  }
  if (apiKey === "") return { ok: false, problem: "The key file is empty" };
  const responseMode = env.LLM_RESPONSE_MODE?.trim() || DEFAULT_RESPONSE_MODE;
  if (responseMode !== "json_object" && responseMode !== "json_schema") {
    return { ok: false, problem: "LLM_RESPONSE_MODE must be json_object or json_schema" };
  }
  return {
    ok: true,
    config: {
      baseUrl: (env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
      model: configuredModel(env),
      apiKey,
      responseMode,
    },
  };
}
