import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiError } from "@/ai/client";
import { createInterpretationCache } from "@/ai/cache";
import type { InterpretOutcome } from "@/ai/interpret";
import type { Phrased } from "@/ai/phrase";
import type { Interpretation } from "@/tools/spec";
import { TRACE_STAGES } from "@/tools/trace-stage";
import { handleAsk } from "./handle-ask";

const MODEL_SENTENCE = "3 orders were delivered late in 1–30 Nov 2025.";

/**
 * The handler with a fake interpreter that answers every question with `outcome`, and a fake
 * phrase step that writes MODEL_SENTENCE (or fails), counting calls to both.
 */
function setup(outcome: () => Promise<InterpretOutcome>, phrasing: () => Promise<Phrased> = async () => ({ sentence: MODEL_SENTENCE, source: "model", cacheable: true })) {
  let calls = 0;
  let phraseCalls = 0;
  let clock = 0;
  const deps = {
    // A clock that moves 10 ms on every reading, so each timed stage takes 10 ms.
    now: () => (clock += 10),
    interpret: async () => {
      calls += 1;
      return outcome();
    },
    phrase: async () => {
      phraseCalls += 1;
      return phrasing();
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
  return { ask, calls: () => calls, phraseCalls: () => phraseCalls };
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

  it("opens the answer with the phrased sentence (ADR 0009 §4)", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH));
    expect((await ask("How many orders were delivered late last month?")).body).toMatchObject({
      sentence: MODEL_SENTENCE,
      sentenceSource: "model",
    });
  });

  it("caches the sentence with the spec, so a repeated question makes no second model call of either kind", async () => {
    const { ask, calls, phraseCalls } = setup(interpreted(LATE_LAST_MONTH));
    await ask("How many orders were delivered late last month?");
    expect((await ask("how many orders were delivered late last month")).body).toMatchObject({ cached: true, sentence: MODEL_SENTENCE });
    expect([calls(), phraseCalls()]).toEqual([1, 1]);
  });

  it("does not cache a template that stood in for a failed phrase call, so the next ask tries again", async () => {
    const { ask, phraseCalls } = setup(interpreted(LATE_LAST_MONTH), async () => ({
      sentence: "Delayed orders: 3 in 1–30 Nov 2025, by delivery date.",
      source: "template",
      cacheable: false,
      rejectedBecause: "the model was busy",
    }));
    await ask("How many orders were delivered late last month?");
    expect((await ask("How many orders were delivered late last month?")).body).toMatchObject({ cached: true });
    expect(phraseCalls()).toBe(2);
  });

  it("still answers, with the template sentence, when the phrase step fails", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH), async () => {
      throw new Error("phrase call failed");
    });
    expect((await ask("How many orders were delivered late last month?")).body).toMatchObject({
      kind: "result",
      rows: [{ value: 3 }],
      sentence: "Delayed orders: 3 in 1–30 Nov 2025, by delivery date.",
      sentenceSource: "template",
    });
  });

  it("runs a total forecast through the forecast tool and opens it with the phrased sentence (ADR 0003)", async () => {
    const sentence = "Over Jan–Mar 2026, plan for 405 units: 285 forecast plus 120 safety stock.";
    const { ask, calls, phraseCalls } = setup(interpreted({ tool: "forecast", scope: { type: "total" } }), async () => ({
      sentence,
      source: "model",
      cacheable: true,
    }));
    const { status, body } = await ask("How much inventory should I plan for the next 3 months?");
    expect(status).toBe(200);
    expect(body).toMatchObject({
      kind: "forecast",
      cached: false,
      monthsLabel: "Jan–Mar 2026",
      recommendation: { units: 405, demand: 285, safetyStock: 120 },
      method: { id: "moving_average" },
      sentence,
      sentenceSource: "model",
    });
    // Asked again: the spec and the sentence come from the cache, with no model call of either kind.
    expect((await ask("How much inventory should I plan for the next 3 months?")).body).toMatchObject({ kind: "forecast", cached: true, sentence });
    expect([calls(), phraseCalls()]).toEqual([1, 1]);
  });

  it("runs a warehouse forecast, and a SKU question with its category's forecast (ticket 14)", async () => {
    const { ask } = setup(interpreted({ tool: "forecast", scope: { type: "warehouse", value: "LON-FC1" } }));
    expect((await ask("How much stock should LON-FC1 plan for?")).body).toMatchObject({
      kind: "forecast",
      scopeLabel: "warehouse LON-FC1",
      recommendation: { units: 40, demand: 9, safetyStock: 31 },
    });
    const sku = setup(interpreted({ tool: "forecast", scope: { type: "sku", value: "CRAYON-0008" } }));
    expect((await sku.ask("How many CRAYON-0008 will we sell?")).body).toMatchObject({
      kind: "forecast",
      sku: { id: "CRAYON-0008", category: "CRAYON" },
      recommendation: { units: 55, demand: 11, safetyStock: 44 },
    });
  });

  it("answers an unknown SKU with its message, and makes no phrase call when there is no result to phrase", async () => {
    const { ask, phraseCalls } = setup(interpreted({ tool: "forecast", scope: { type: "sku", value: "CRAYON-9999" } }));
    expect((await ask("Forecast SKU CRAYON-9999")).body).toEqual({
      kind: "no-data",
      cached: false,
      message: "No SKU CRAYON-9999 in the data. SKU IDs are a category and a number, for example CRAYON-0008.",
    });
    expect(phraseCalls()).toBe(0);
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
      problems: ["tool: Invalid input"],
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

describe("POST /api/ask: the pipeline trace (B5, ADR 0008 §4)", () => {
  const traceSchema = z.object({
    trace: z.array(z.strictObject({ stage: z.enum(TRACE_STAGES), detail: z.string(), ms: z.number().optional(), flagged: z.boolean().optional() })),
  });
  const traceOf = (body: unknown) => traceSchema.parse(body).trace;
  const stage = (body: unknown, name: string) => traceOf(body).find((entry) => entry.stage === name);

  it("gives every stage of R7 in order, timed where it takes time: model interpretation, computation, phrasing with the guard passed", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH));
    const { body } = await ask("How many orders were delivered late last month?");
    expect(traceOf(body)).toEqual([
      { stage: "question", detail: "asked in words" },
      { stage: "interpretation", detail: "by the model", ms: 10 },
      { stage: "tool", detail: "query tool: delayed orders" },
      { stage: "computation", detail: "computed in code", ms: 10 },
      { stage: "result", detail: "1 value" },
      { stage: "phrasing", detail: "by the model, guard passed", ms: 10 },
      { stage: "chart", detail: "answer card" },
    ]);
  });

  it("says when the cache answered: the interpretation and the sentence, with no model call", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH));
    await ask("How many orders were delivered late last month?");
    const { body } = await ask("How many orders were delivered late last month?");
    expect(stage(body, "interpretation")).toMatchObject({ detail: "from the cache, no model call" });
    expect(stage(body, "phrasing")).toEqual({ stage: "phrasing", detail: "sentence from the cache (guard passed)" });
  });

  it("flags a cached template with the reason the model's sentence was dropped", async () => {
    const { ask } = setup(interpreted(LATE_LAST_MONTH), async () => ({
      sentence: "Delayed orders: 3 in 1–30 Nov 2025, by delivery date.",
      source: "template",
      cacheable: true,
      rejectedBecause: "a number not in the facts",
    }));
    await ask("How many orders were delivered late last month?");
    const { body } = await ask("How many orders were delivered late last month?");
    expect(stage(body, "phrasing")).toEqual({ stage: "phrasing", detail: "template from the cache: a number not in the facts", flagged: true });
  });

  it("flags a retry, a template fallback with its reason, a phrase step that threw, and a status rewrite", async () => {
    const retried = setup(async () => ({ kind: "interpreted", interpretation: LATE_LAST_MONTH, attempts: 2 }));
    expect(stage((await retried.ask("late last month")).body, "interpretation")).toEqual({
      stage: "interpretation",
      detail: "by the model, after one retry: the first reply was not a valid spec",
      ms: 10,
      flagged: true,
    });
    const rejected = setup(interpreted(LATE_LAST_MONTH), async () => ({
      sentence: "template",
      source: "template",
      cacheable: true,
      rejectedBecause: "a number not in the facts",
    }));
    expect(stage((await rejected.ask("late last month")).body, "phrasing")).toEqual({
      stage: "phrasing",
      detail: "template: a number not in the facts",
      ms: 10,
      flagged: true,
    });
    const threw = setup(interpreted(LATE_LAST_MONTH), async () => {
      throw new Error("a bug in the phrase step");
    });
    expect(stage((await threw.ask("late last month")).body, "phrasing")).toMatchObject({ detail: "template: the phrase step failed", flagged: true });
    const rewrite = setup(interpreted({ tool: "query", metric: "order_count", filters: { status: ["delayed"] } }));
    expect(stage((await rewrite.ask("orders with status delayed")).body, "computation")).toMatchObject({
      detail: "status rewrite: order count with status delayed → delayed orders",
      flagged: true,
    });
  });

  it("traces a forecast, and sends no trace with an answer that has no explanation panel", async () => {
    const forecast = setup(interpreted({ tool: "forecast", scope: { type: "total" } }));
    expect(stage((await forecast.ask("How much inventory should I plan?")).body, "tool")).toEqual({ stage: "tool", detail: "forecast tool: all products" });
    const unknown = setup(interpreted({ tool: "forecast", scope: { type: "sku", value: "CRAYON-9999" } }));
    expect((await unknown.ask("Forecast SKU CRAYON-9999")).body).not.toHaveProperty("trace");
  });
});
