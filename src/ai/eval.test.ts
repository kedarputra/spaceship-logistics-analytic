import { describe, expect, it } from "vitest";
import type { Interpretation } from "@/tools/spec";
import { AiError } from "./client";
import { evalFileSchema, formatEvalReport, runEval } from "./eval";
import type { InterpretOutcome } from "./interpret";

const { questions } = evalFileSchema.parse({
  questions: [
    {
      id: "late",
      question: "How many orders were delivered late last month?",
      expected: { tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" }, assumption: "late" },
    },
    {
      id: "carriers",
      question: "Which carrier has the highest delay rate?",
      expected: { tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 },
    },
    {
      id: "weather",
      question: "What is the weather in Jakarta?",
      expected: { tool: "unsupported", reason: "not_about_data", examples: ["late_last_month", "orders_by_month", "inventory_plan"] },
    },
    {
      id: "fedx",
      question: "Orders shipped with fedx",
      expected: { tool: "query", metric: "order_count", filters: { carrier: ["FedEx"] } },
    },
  ],
});

const interpreted = (interpretation: Interpretation): InterpretOutcome => ({ kind: "interpreted", interpretation, attempts: 1 });

/** A fake interpreter: right on "late", wrong direction on "carriers", busy on "weather", no valid spec on "fedx". */
async function fakeInterpret(question: string): Promise<InterpretOutcome> {
  if (question.startsWith("How many")) {
    return interpreted({ tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" }, assumption: "late" });
  }
  if (question.startsWith("Which carrier")) return interpreted({ tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "asc", limit: 1 });
  if (question.startsWith("What is the weather")) throw new AiError("busy");
  return {
    kind: "failed",
    message: 'Unknown carrier "fedx". Did you mean "FedEx"?',
    examples: ["late_last_month", "delayed_by_week", "highest_delay_rate"],
    problems: ['filters.carrier.0: Unknown carrier "fedx". Did you mean "FedEx"?'],
  };
}

describe("the eval run (ADR 0009 §12)", () => {
  it("counts the questions whose spec matches, and records each miss with expected and actual specs", async () => {
    const result = await runEval(questions, fakeInterpret);
    expect(result.total).toBe(4);
    expect(result.passed).toBe(1);
    expect(result.misses.map((miss) => miss.id)).toEqual(["carriers", "weather", "fedx"]);
    expect(result.misses[0]).toMatchObject({
      question: "Which carrier has the highest delay rate?",
      expected: { metric: "delay_rate", sort: "desc", limit: 1 },
      actual: { metric: "delay_rate", sort: "asc", limit: 1 },
    });
  });

  it("records a failed call, or a reply with no valid spec, as a miss with its message", async () => {
    const bug = await runEval(questions.slice(0, 1), async () => {
      throw new TypeError("x is undefined");
    });
    // A bug in the code shows as itself, not as a gateway outage.
    expect(bug.misses[0]?.error).toBe("TypeError: x is undefined");
    const result = await runEval(questions, fakeInterpret);
    expect(result.misses[1]).toMatchObject({ id: "weather", error: "The AI is busy, try again shortly." });
    expect(result.misses[1]?.actual).toBeUndefined();
    expect(result.misses[2]).toMatchObject({
      id: "fedx",
      error: 'No valid spec, even after the retry: filters.carrier.0: Unknown carrier "fedx". Did you mean "FedEx"?',
    });
  });

  it("asks the questions one at a time, in the list's order, and reports each as it goes", async () => {
    const asked: string[] = [];
    const seen: [string, boolean][] = [];
    await runEval(
      questions,
      async (question) => {
        asked.push(question);
        return fakeInterpret(question);
      },
      (id, passed) => seen.push([id, passed]),
    );
    expect(asked).toEqual(questions.map((entry) => entry.question));
    expect(seen).toEqual([
      ["late", true],
      ["carriers", false],
      ["weather", false],
      ["fedx", false],
    ]);
  });
});

describe("the eval report", () => {
  it("gives the pass rate, the model the gateway answered with, the date, and every miss", async () => {
    const lines = formatEvalReport(await runEval(questions, fakeInterpret), { date: "2026-11-20", model: "gemma-4-12b-it", configuredModel: "chat" });
    expect(lines.slice(0, 2)).toEqual(['Eval, 2026-11-20, model gemma-4-12b-it (configured as "chat"): 4 questions.', "1 of 4 specs match (25%)."]);
    const text = lines.join("\n");
    expect(text).toContain("- carriers: Which carrier has the highest delay rate?");
    expect(text).toContain('expected {"tool":"query","metric":"delay_rate","groupBy":"carrier","period":{"type":"all"},"dateField":"delivery_date","sort":"desc","limit":1}');
    expect(text).toContain('actual   {"tool":"query","metric":"delay_rate","groupBy":"carrier","period":{"type":"all"},"dateField":"delivery_date","sort":"asc","limit":1}');
    expect(text).toContain("error    The AI is busy, try again shortly.");
  });

  it("names the model once when the gateway answers with the configured name, and says when every spec matched", async () => {
    const lines = formatEvalReport(await runEval(questions.slice(0, 1), fakeInterpret), { date: "2026-11-20", model: "gemma12", configuredModel: "gemma12" });
    expect(lines).toEqual(["Eval, 2026-11-20, model gemma12: 1 question.", "1 of 1 specs match (100%).", "No misses."]);
  });
});
