import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiError, createClient, type FetchLike } from "./client";
import { type LlmConfig, readLlmConfig } from "./config";

const CONFIG: LlmConfig = { baseUrl: "http://gateway.test/v1", model: "chat", apiKey: "test-key", responseMode: "json_object" };

function reply(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

const REQUEST = { messages: [{ role: "user" as const, content: "hi" }], temperature: 0 };

async function errorKind(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    return error instanceof AiError ? error.kind : `other: ${String(error)}`;
  }
}

describe("LLM configuration (ADR 0009 §1)", () => {
  const files = (contents: Record<string, string>) => (path: string) => {
    const content = contents[path];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };

  it("reads the key from the key file, with the default URL, model and response mode", () => {
    expect(readLlmConfig({ LLM_API_KEY_FILE: "/keys/spaceship" }, files({ "/keys/spaceship": "secret\n" }))).toEqual({
      ok: true,
      config: { baseUrl: "http://127.0.0.1:4000/v1", model: "chat", apiKey: "secret", responseMode: "json_object" },
    });
  });

  it("takes the URL, model and response mode from the environment when set", () => {
    const env = { LLM_BASE_URL: "http://gw:4000/v1/", LLM_MODEL: "gemma12", LLM_API_KEY_FILE: "/k", LLM_RESPONSE_MODE: "json_schema" };
    expect(readLlmConfig(env, files({ "/k": "secret" }))).toMatchObject({
      ok: true,
      config: { baseUrl: "http://gw:4000/v1", model: "gemma12", responseMode: "json_schema" },
    });
  });

  it("is not configured without a key file, with an unreadable or empty one, or with an unknown response mode", () => {
    expect(readLlmConfig({}, files({})).ok).toBe(false);
    expect(readLlmConfig({ LLM_API_KEY_FILE: "/missing" }, files({})).ok).toBe(false);
    expect(readLlmConfig({ LLM_API_KEY_FILE: "/k" }, files({ "/k": "  \n" })).ok).toBe(false);
    expect(readLlmConfig({ LLM_API_KEY_FILE: "/k", LLM_RESPONSE_MODE: "xml" }, files({ "/k": "secret" })).ok).toBe(false);
  });
});

describe("the gateway client (ADR 0009 §2)", () => {
  it("posts the chat completion with the key, the model and the temperature, and returns the message", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetch: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return reply('{"tool":"query"}');
    };
    const client = createClient(CONFIG, { fetch });
    const content = await client.complete({ ...REQUEST, responseFormat: { type: "json_object" } });
    expect(content).toBe('{"tool":"query"}');
    expect(calls[0]?.url).toBe("http://gateway.test/v1/chat/completions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: "chat",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0,
      response_format: { type: "json_object" },
    });
  });
});

describe("gateway errors (ADR 0009 §9)", () => {
  const failing = (response: () => Promise<Response>) => createClient(CONFIG, { fetch: response, log: () => undefined });

  it("reads 429 as busy, 401 and 403 as not configured, 5xx as unavailable", async () => {
    expect(await errorKind(failing(async () => reply("", 429)).complete(REQUEST))).toBe("busy");
    expect(await errorKind(failing(async () => reply("", 401)).complete(REQUEST))).toBe("not-configured");
    expect(await errorKind(failing(async () => reply("", 403)).complete(REQUEST))).toBe("not-configured");
    expect(await errorKind(failing(async () => reply("", 502)).complete(REQUEST))).toBe("unavailable");
  });

  it("reads a refused connection and a reply without a message as unavailable", async () => {
    expect(await errorKind(failing(() => Promise.reject(new TypeError("fetch failed: ECONNREFUSED"))).complete(REQUEST))).toBe(
      "unavailable",
    );
    expect(await errorKind(failing(async () => new Response("<html>", { status: 200 })).complete(REQUEST))).toBe("unavailable");
  });

  it("keeps the HTTP status of a refusal, so the smoke check can tell a rejected format from an outage", async () => {
    try {
      await failing(async () => reply("", 400)).complete(REQUEST);
    } catch (error) {
      expect(error instanceof AiError && [error.kind, error.status]).toEqual(["unavailable", 400]);
    }
  });

  it("gives every error a message for the user", async () => {
    try {
      await failing(async () => reply("", 429)).complete(REQUEST);
    } catch (error) {
      expect(error instanceof AiError && error.message).toBe("The AI is busy, try again shortly.");
    }
  });
});

describe("timeouts and concurrency (ADR 0009 §2, §5)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A gateway that answers only when told to, and gives up when the request is aborted. */
  function heldGateway() {
    const pending: { resolve: (response: Response) => void }[] = [];
    const fetch: FetchLike = (_url, init) =>
      new Promise((resolve, reject) => {
        pending.push({ resolve });
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    return { fetch, pending };
  }

  it("gives up on a call after 15 seconds", async () => {
    const { fetch } = heldGateway();
    const outcome = errorKind(createClient(CONFIG, { fetch }).complete(REQUEST));
    await vi.advanceTimersByTimeAsync(14_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe("unavailable");
  });

  it("runs at most 2 calls at once; a third waits for a free slot", async () => {
    const { fetch, pending } = heldGateway();
    const client = createClient(CONFIG, { fetch });
    const first = client.complete(REQUEST);
    const second = client.complete(REQUEST);
    const third = client.complete(REQUEST);
    await vi.advanceTimersByTimeAsync(0);
    expect(pending).toHaveLength(2);
    pending[0]?.resolve(reply("one"));
    await vi.advanceTimersByTimeAsync(0);
    expect(pending).toHaveLength(3);
    pending[1]?.resolve(reply("two"));
    pending[2]?.resolve(reply("three"));
    expect(await Promise.all([first, second, third])).toEqual(["one", "two", "three"]);
  });

  it('answers "busy" to a call that waits more than 10 seconds for a slot', async () => {
    const { fetch } = heldGateway();
    const client = createClient(CONFIG, { fetch });
    void client.complete(REQUEST).catch(() => undefined);
    void client.complete(REQUEST).catch(() => undefined);
    const third = errorKind(client.complete(REQUEST));
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await third).toBe("busy");
  });
});
