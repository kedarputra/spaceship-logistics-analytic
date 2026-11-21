import { decodeText, readBytes } from "./text-file";

/**
 * The key that signs sessions (ticket 31, ADR 0012): 32 random bytes or more, base64. On the server it
 * lives in the file AUTH_SECRET_FILE names, as the LLM key does (ADR 0009); AUTH_SECRET holds it
 * directly, for local runs and CI. Setting both is refused. Without a usable key the app fails
 * closed: /login says sign-in isn't configured, and nothing else opens.
 */

export const MIN_SECRET_BYTES = 32;

export type SecretResult = { ok: true; key: Buffer } | { ok: false; problem: string };

type Environment = Record<string, string | undefined>;

/** Standard base64 or its URL-safe form, which Node's decoder also reads. */
const BASE64 = /^(?:[A-Za-z0-9+/]+={0,2}|[A-Za-z0-9_-]+)$/;

function keyFrom(text: string): SecretResult {
  const key = BASE64.test(text) ? Buffer.from(text, "base64") : Buffer.alloc(0);
  if (key.length < MIN_SECRET_BYTES) return { ok: false, problem: `The secret must be at least ${MIN_SECRET_BYTES} random bytes, base64-encoded` };
  return { ok: true, key };
}

export function readAuthSecret(env: Environment, readFile: (path: string) => Buffer = readBytes): SecretResult {
  const file = env.AUTH_SECRET_FILE?.trim();
  const direct = env.AUTH_SECRET?.trim();
  if (file && direct) return { ok: false, problem: "Set AUTH_SECRET_FILE or AUTH_SECRET, not both" };
  if (direct) return keyFrom(direct);
  if (!file) return { ok: false, problem: "AUTH_SECRET_FILE (or AUTH_SECRET) is not set" };
  let text: string;
  try {
    text = decodeText(readFile(file)).trim();
  } catch {
    return { ok: false, problem: "The file AUTH_SECRET_FILE names cannot be read" };
  }
  if (text === "") return { ok: false, problem: "The secret file is empty" };
  return keyFrom(text);
}

let remembered: { from: string; result: SecretResult } | undefined;

/**
 * The server's key, from process.env. A key that was read is kept while the variables stay the same;
 * a problem is not kept, so a fixed file is picked up on the next request. Changing the secret file
 * itself needs a restart.
 */
export function authSecret(env: Environment = process.env): SecretResult {
  const from = `${env.AUTH_SECRET_FILE ?? ""}\0${env.AUTH_SECRET ?? ""}`;
  if (remembered?.from === from && remembered.result.ok) return remembered.result;
  const result = readAuthSecret(env);
  remembered = { from, result };
  return result;
}
