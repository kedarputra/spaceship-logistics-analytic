import { describe, expect, it } from "vitest";
import { AiError } from "@/ai/client";
import { createInterpretationCache } from "@/ai/cache";
import type { InterpretOutcome } from "@/ai/interpret";
import type { Interpretation } from "@/tools/spec";
import { handleAsk } from "./handle-ask";

/** The handler with a fake interpreter that answers every question with `outcome`, counting calls. */
function setup(outcome: () => Promise<InterpretOutcome>) {
  let calls = 0;
  const deps = {
    interpret: async () => {
      calls += 1;
      return outcome();
    },
    modelName: () => "fake-model",
    cache: createInterpretationCache(),
  };
  const ask = async (question: unknown) => {
    const response = await handleAsk(
      new Request("http://localhost/api/ask", { method: "POST", body: JSON.stringify({ question }) }),
      deps,
    );
    const body: unknown = await response.json();
    return { status: response.status, body };
  };
  return { ask, calls: () => calls };
}

const interpreted = (interpretation: Interpretation) => async (): Promise<InterpretOutcome> => ({
  kind: "interpreted",
  interpretation,
  attempts: 1,
});

const LATE_LAST_MONTH: Interpretation = { tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" }, assumption: "late" };

describe("POST /api/ask: the question (ADR 0009 §8)", () => {
  it("rejects a question over 300 characters before any model call", async () => {
    const { ask, calls } = setup(interpreted(LATE_LAST_MONTH));
    expect(await ask("x".repeat(301))).toEqual({ status: 400, body: { error: "Questions can be up to 300 characters." } });
    expect(calls()).toBe(0);
  });

  it("rejects an empty question or a body without one", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH));
    expect((await ask("   ")).status).toBe(400);
    expect((await ask(42)).status).toBe(400);
  });
});

describe("POST /api/ask: the answer (R3, R7)", () => {
  it("runs the interpreted spec through the query tool: 3 delivered late last month, with the default stated", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH));
    const { status, body } = await ask("How many orders were delivered late last month?");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      kind: "result",
      cached: false,
      rows: [{ value: 3 }],
      interpretation: "Delayed orders, 1–30 Nov 2025 by delivery date.",
      assumptionNote: '"Late" is read as delayed orders; exception orders are counted separately.',
    });
  });

  it("serves the same question again from the cache, whatever its case, spacing or final question mark", async () => {
    const { ask, calls } = setup(interpreted(LATE_LAST_MONTH));
    await ask("How many orders were delivered late last month?");
    const again = await ask("  how many orders   were delivered LATE last month  ");
    expect(again.body).toMatchObject({ kind: "result", cached: true, rows: [{ value: 3 }] });
    expect((await ask("How many orders were delivered late last month…,")).body).toMatchObject({ cached: true });
    expect(calls()).toBe(1);
  });

  it('answers a forecast with an honest "not available yet"', async () => {
    const { ask } = setup(interpreted({ tool: "forecast", scope: { type: "total" } }));
    expect((await ask("How much inventory should I plan?")).body).toEqual({
      kind: "unavailable",
      cached: false,
      message: "Demand forecasts are not available yet. Questions about past orders work.",
    });
  });

  it("answers an unsupported question with why, and 3 supported questions from the fixed list", async () => {
    const { ask } = setup(
      interpreted({ tool: "unsupported", reason: "numeric_filter", examples: ["orders_by_month", "on_time_by_region", "inventory_plan"] }),
    );
    expect((await ask("Orders with more than 5 units by region and carrier")).body).toEqual({
      kind: "unsupported",
      cached: false,
      message: "Filters on numbers, such as orders with more than 5 units, aren't supported.",
      examples: [
        "How many orders were placed each month?",
        "What is the on-time delivery rate by region?",
        "How much inventory should I plan for the next 3 months?",
      ],
    });
  });

  it("says so honestly when the model could not produce a valid spec, and does not cache it", async () => {
    const { ask, calls } = setup(async () => ({
      kind: "failed",
      message: "That question could not be turned into a query this tool can run. Try one of these:",
      examples: ["late_last_month", "delayed_by_week", "highest_delay_rate"],
    }));
    const { body } = await ask("blorp");
    expect(body).toEqual({
      kind: "unsupported",
      cached: false,
      message: "That question could not be turned into a query this tool can run. Try one of these:",
      examples: [
        "How many orders were delivered late last month?",
        "Show delayed orders by week for the last 3 months",
        "Which carrier has the highest delay rate?",
      ],
    });
    await ask("blorp");
    expect(calls()).toBe(2);
  });
});

describe("POST /api/ask: when the AI cannot answer (ADR 0009 §9)", () => {
  const failing = (kind: "busy" | "not-configured" | "unavailable") =>
    setup(async () => {
      throw new AiError(kind);
    });

  it("passes on the gateway's state as a message the page shows", async () => {
    expect(await failing("busy").ask("late last month")).toEqual({ status: 429, body: { error: "The AI is busy, try again shortly." } });
    expect(await failing("not-configured").ask("late last month")).toEqual({
      status: 503,
      body: { error: "AI not configured, so questions cannot be answered. The dashboard still works." },
    });
    expect(await failing("unavailable").ask("late last month")).toEqual({
      status: 503,
      body: { error: "AI unavailable right now. The dashboard still works." },
    });
  });
});
