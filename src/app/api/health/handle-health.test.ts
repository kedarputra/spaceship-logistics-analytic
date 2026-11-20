import { describe, expect, it } from "vitest";
import type { AiHealth } from "@/ai/health";
import { handleHealth } from "./handle-health";

function setup(health: AiHealth) {
  let checks = 0;
  const get = async (url: string) => {
    const response = await handleHealth(new Request(url), {
      checkAi: async () => {
        checks += 1;
        return health;
      },
    });
    return { status: response.status, text: await response.text() };
  };
  return { get, checks: () => checks };
}

const UP: AiHealth = { up: true, model: "gemma-4-12b-it" };

describe("GET /api/health (ADR 0005, ADR 0009 §11)", () => {
  it('answers {"rows":400,"anchor":"2025-12-31"} without touching the AI', async () => {
    const { get, checks } = setup(UP);
    expect(await get("http://localhost/api/health")).toEqual({ status: 200, text: '{"rows":400,"anchor":"2025-12-31"}' });
    expect(checks()).toBe(0);
  });

  it("adds the AI's state with ?ai=1: up, and the model the gateway answers with", async () => {
    const { get } = setup(UP);
    const { status, text } = await get("http://localhost/api/health?ai=1");
    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({ rows: 400, anchor: "2025-12-31", ai: { up: true, model: "gemma-4-12b-it" } });
  });

  it("answers 503 with ?ai=1 when the AI is down, so a check that only reads the status fails", async () => {
    const { get } = setup({ up: false, error: "AI unavailable right now. The dashboard still works." });
    const { status, text } = await get("http://localhost/api/health?ai=1");
    expect(status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ rows: 400, ai: { up: false, error: "AI unavailable right now. The dashboard still works." } });
  });
});
