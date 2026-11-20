import { describe, expect, it } from "vitest";
import { AI_ERROR_MESSAGES, AiError } from "./client";
import { createAiHealthCheck } from "./health";

/** A fake 1-token call that answers with `model` or fails, counting its calls, and a clock the test moves. */
function setup(answer: () => Promise<string | undefined>) {
  let calls = 0;
  let time = 0;
  const check = createAiHealthCheck(
    () => {
      calls += 1;
      return answer();
    },
    () => time,
  );
  return { check, calls: () => calls, at: (ms: number) => (time = ms) };
}

describe("the AI health check behind /api/health?ai=1 (ADR 0009 §11)", () => {
  it("reports the AI up, with the model name the gateway answers with", async () => {
    const { check } = setup(async () => "gemma-4-12b-it");
    expect(await check()).toEqual({ up: true, model: "gemma-4-12b-it" });
  });

  it("reports a busy gateway as up, since it answered: other workloads can hold every slot (ADR 0010 §8)", async () => {
    const { check } = setup(async () => {
      throw new AiError("busy", 429);
    });
    expect(await check()).toEqual({ up: true, model: undefined, busy: true });
  });

  it("reports the AI down with the message a question would get", async () => {
    for (const kind of ["not-configured", "unavailable"] as const) {
      const { check } = setup(async () => {
        throw new AiError(kind);
      });
      expect(await check()).toEqual({ up: false, error: AI_ERROR_MESSAGES[kind] });
    }
    const { check } = setup(async () => {
      throw new Error("socket hang up");
    });
    expect(await check()).toEqual({ up: false, error: AI_ERROR_MESSAGES.unavailable });
  });

  it("remembers the answer for 60 s, so it costs at most one GPU call a minute", async () => {
    const { check, calls, at } = setup(async () => "gemma-4-12b-it");
    await check();
    at(59_999);
    await check();
    expect(calls()).toBe(1);
    at(60_000);
    await check();
    expect(calls()).toBe(2);
  });

  it("shares one call between checks that arrive while it runs", async () => {
    let finish: (model: string) => void = () => undefined;
    const { check, calls } = setup(() => new Promise((resolve) => (finish = resolve)));
    const first = check();
    const second = check();
    finish("gemma-4-12b-it");
    expect(await Promise.all([first, second])).toEqual([
      { up: true, model: "gemma-4-12b-it" },
      { up: true, model: "gemma-4-12b-it" },
    ]);
    expect(calls()).toBe(1);
  });
});
