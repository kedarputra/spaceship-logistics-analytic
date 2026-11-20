import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UNSUPPORTED_REASONS } from "@/tools/examples";
import { interpretationSchema } from "@/tools/spec";
import { AiError, type CompletionRequest, type LlmClient } from "./client";
import { interpret } from "./interpret";
import { PROMPT_EXAMPLES, interpretMessages } from "./prompts";

/** A model that gives the replies it was handed, in order, and records what it was asked. */
function fakeModel(...replies: string[]) {
  const requests: CompletionRequest[] = [];
  const client: LlmClient = {
    complete: async (request) => {
      requests.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error("The fake model ran out of replies");
      return { text: reply, finishReason: "stop" };
    },
  };
  return { client, requests };
}

const LATE_LAST_MONTH = JSON.stringify({ tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" } });

describe("interpret: question → validated spec (ADR 0009 §3)", () => {
  it("returns the spec the model wrote once it validates, asked at temperature 0", async () => {
    const { client, requests } = fakeModel(LATE_LAST_MONTH);
    expect(await interpret("How many orders were delivered late last month?", client, "json_object")).toEqual({
      kind: "interpreted",
      interpretation: { tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" } },
      attempts: 1,
    });
    expect(requests[0]?.temperature).toBe(0);
    expect(requests[0]?.responseFormat).toEqual({ type: "json_object" });
  });

  it("sends the JSON Schema derived from the whitelist in json_schema mode", async () => {
    const { client, requests } = fakeModel(LATE_LAST_MONTH);
    await interpret("late last month", client, "json_schema");
    expect(requests[0]?.responseFormat).toEqual({
      type: "json_schema",
      json_schema: { name: "interpretation", schema: z.toJSONSchema(interpretationSchema), strict: true },
    });
  });

  it("takes the JSON out of a code fence", async () => {
    const { client } = fakeModel(`\`\`\`json\n${LATE_LAST_MONTH}\n\`\`\``);
    expect((await interpret("late last month", client, "json_object")).kind).toBe("interpreted");
  });

  it("interprets forecasts and unsupported questions too", async () => {
    const forecast = fakeModel(JSON.stringify({ tool: "forecast", scope: { type: "total" }, horizon: { count: 4, unit: "month" } }));
    expect(await interpret("demand for the next 4 months", forecast.client, "json_object")).toMatchObject({
      kind: "interpreted",
      interpretation: { tool: "forecast" },
    });
    const unsupported = fakeModel(
      JSON.stringify({ tool: "unsupported", reason: "not_about_data", examples: ["late_last_month", "orders_by_month", "inventory_plan"] }),
    );
    expect(await interpret("What's the weather?", unsupported.client, "json_object")).toMatchObject({
      kind: "interpreted",
      interpretation: { tool: "unsupported", reason: "not_about_data" },
    });
  });
});

describe("invalid output (ADR 0009 §3)", () => {
  it("retries once with the validation error, then uses the corrected spec", async () => {
    const wrong = JSON.stringify({ tool: "query", metric: "order_count", filters: { carrier: ["fedx"] } });
    const right = JSON.stringify({ tool: "query", metric: "order_count", filters: { carrier: ["FedEx"] } });
    const { client, requests } = fakeModel(wrong, right);
    expect(await interpret("orders by fedx", client, "json_object")).toMatchObject({ kind: "interpreted", attempts: 2 });
    const retry = requests[1]?.messages ?? [];
    expect(retry.at(-2)).toEqual({ role: "assistant", content: wrong });
    expect(retry.at(-1)?.content).toContain('Unknown carrier "fedx". Did you mean "FedEx"?');
  });

  it("retries truncated JSON too", async () => {
    const { client } = fakeModel('{"tool":"query","metric":"delayed_ord', LATE_LAST_MONTH);
    expect(await interpret("late last month", client, "json_object")).toMatchObject({ kind: "interpreted", attempts: 2 });
  });

  it("gives an honest error with 3 example questions after the second invalid reply, and stops", async () => {
    const { client, requests } = fakeModel("I think about 3?", '{"tool":"sql","query":"SELECT 1"}');
    const outcome = await interpret("how many late", client, "json_object");
    expect(outcome).toEqual({
      kind: "failed",
      message: "That question could not be turned into a query this tool can run. Try one of these:",
      examples: ["late_last_month", "delayed_by_week", "highest_delay_rate"],
    });
    expect(requests).toHaveLength(2);
  });

  it("says which value is not in the data when that is why the retry failed too (ADR 0006 §4)", async () => {
    const atlantis = JSON.stringify({ tool: "query", metric: "order_count", filters: { destination: ["Atlantis"] } });
    const { client } = fakeModel(atlantis, atlantis);
    expect(await interpret("orders to Atlantis", client, "json_object")).toEqual({
      kind: "failed",
      message: 'Unknown destination "Atlantis". It is not in the data.',
      examples: ["late_last_month", "delayed_by_week", "highest_delay_rate"],
    });
  });

  it("lets a gateway error through for the caller to report", async () => {
    const client: LlmClient = {
      complete: async () => {
        throw new AiError("busy");
      },
    };
    await expect(interpret("late last month", client, "json_object")).rejects.toThrow("The AI is busy, try again shortly.");
  });
});

describe("the prompt (ADR 0009 §10)", () => {
  const prompt = interpretMessages("How many orders were delivered late last month?")
    .map((message) => message.content)
    .join("\n");

  it("gives the metric definitions, the allowed values and the schema, and ends with the question", () => {
    expect(prompt).toContain("Delayed orders divided by delivered orders.");
    expect(prompt).toContain("Royal Mail");
    expect(prompt).toContain("CRAYON");
    expect(prompt).toContain('"enum":["forecast"]');
    expect(interpretMessages("late last month").at(-1)).toEqual({ role: "user", content: "late last month" });
  });

  it("never tells the model the anchor date: periods stay symbolic (ADR 0002 §1)", () => {
    expect(prompt).not.toContain("2025-12-31");
    expect(prompt).not.toContain("31 Dec 2025");
  });

  it("names the example questions by id only, so the R3 questions are never in the prompt word for word", () => {
    const system = interpretMessages("anything")[0]?.content ?? "";
    expect(system).not.toContain("How many orders were delivered late last month?");
    expect(system).not.toContain("Show delayed orders by week for the last 3 months");
    expect(system).not.toContain("Which carrier has the highest delay rate?");
    expect(system).toContain("late_last_month");
  });

  it("spells out which way delivery-time words point, so 'slowest' is not read as fewest days (ticket 22)", () => {
    const system = interpretMessages("anything")[0]?.content ?? "";
    expect(system).toContain('for delivery time, "slowest", "longest" and "worst" mean the most days ("sort":"desc")');
    expect(system).toContain('"fastest", "quickest" and "shortest" mean the fewest days ("sort":"asc")');
  });

  it("knows the share of orders, so a share question is not answered with a count", () => {
    const system = interpretMessages("anything")[0]?.content ?? "";
    expect(system).toContain('"share", "percentage" or "what part" of orders is order_share');
    expect(system).toContain("A percentage delivered on time, delayed or with an exception is on_time_rate or delay_rate, never order_share");
    expect(PROMPT_EXAMPLES.some((example) => example.spec.tool === "query" && example.spec.metric === "order_share")).toBe(true);
  });

  it("reads named months as a forecast target, and a forecast for two things at once as unsupported (ticket 14)", () => {
    const system = interpretMessages("anything")[0]?.content ?? "";
    expect(system).toContain('Months named in the question are a "target", never a horizon: "in 2027" = {"type":"year","year":2027}');
    expect(system).toContain(
      'A forecast covers one thing: the total, one category, one warehouse or one region. A question that combines two, such as crayons at LON-FC1, is unsupported with reason "forecast_combination".',
    );
    expect(UNSUPPORTED_REASONS.forecast_combination).toBe(
      "A forecast covers one thing at a time: the total, one category, one warehouse or one region, not a combination such as crayons at one warehouse.",
    );
  });

  it("only shows the model example specs the whitelist accepts", () => {
    expect(PROMPT_EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const example of PROMPT_EXAMPLES) {
      expect(interpretationSchema.safeParse(example.spec).success, example.question).toBe(true);
    }
  });
});
