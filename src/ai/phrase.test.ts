import { describe, expect, it } from "vitest";
import { type Answer, answerQuery } from "@/tools/answer";
import { factsFor, templateSentence } from "@/tools/sentence";
import { querySpecSchema } from "@/tools/spec";
import { AiError, type CompletionRequest, type LlmClient } from "./client";
import { checkNumbers } from "./guard";
import { phrase } from "./phrase";

function answerFor(spec: Record<string, unknown>): Answer {
  const answer = answerQuery(querySpecSchema.parse({ tool: "query", ...spec }));
  if (answer.kind !== "result") throw new Error(answer.message);
  return answer;
}

function fakeModel(reply: string | Error) {
  const requests: CompletionRequest[] = [];
  const client: LlmClient = {
    complete: async (request) => {
      requests.push(request);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { client, requests };
}

const QUESTION = "Which carrier has the highest delay rate?";
const RANKING = answerFor({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 });

describe("phrase: result → one or two sentences (ADR 0009 §4)", () => {
  it("asks at temperature 0.2 with the question, the spec summary, the definition, the small-sample case and the facts", async () => {
    const { client, requests } = fakeModel("GLS is highest at 25.0%, but on only 8 deliveries; USPS leads among carriers with at least 20.");
    await phrase(QUESTION, RANKING, client);
    expect(requests[0]?.temperature).toBe(0.2);
    expect(requests[0]?.responseFormat).toBeUndefined();
    const prompt = (requests[0]?.messages ?? []).map((message) => message.content).join("\n");
    expect(prompt).toContain(QUESTION);
    expect(prompt).toContain(RANKING.interpretation);
    expect(prompt).toContain("Delayed orders divided by delivered orders.");
    expect(prompt).toContain("The top group, GLS, is a small sample");
    for (const fact of factsFor(RANKING)) expect(prompt).toContain(fact);
  });

  it("uses the model's sentence when every number in it is in the facts", async () => {
    const sentence = "GLS is highest at 25.0%, but on only 8 deliveries; USPS leads among carriers with at least 20, at 23.4%.";
    expect(await phrase(QUESTION, RANKING, fakeModel(sentence).client)).toEqual({ sentence, source: "model", cacheable: true });
  });

  it("falls back to the template when the sentence has a number computation did not produce", async () => {
    expect(await phrase(QUESTION, RANKING, fakeModel("GLS is highest at 31%.").client)).toEqual({
      sentence: templateSentence(RANKING),
      source: "template",
      cacheable: true,
    });
  });

  it("falls back to the template for a number in words or a multiplier", async () => {
    const template = { sentence: templateSentence(RANKING), source: "template", cacheable: true };
    expect(await phrase(QUESTION, RANKING, fakeModel("GLS is late twice as often as USPS.").client)).toEqual(template);
    expect(await phrase(QUESTION, RANKING, fakeModel("Three carriers do worse than average.").client)).toEqual(template);
  });

  it("falls back to the template when the call fails, and marks that sentence not worth caching", async () => {
    const failed = { sentence: templateSentence(RANKING), source: "template", cacheable: false };
    expect(await phrase(QUESTION, RANKING, fakeModel(new AiError("busy")).client)).toEqual(failed);
    expect(await phrase(QUESTION, RANKING, fakeModel(new Error("socket hang up")).client)).toEqual(failed);
  });

  it("falls back to the template when the sentence leaves out a group it must name (ADR 0001 §6, ties)", async () => {
    const withoutUsps = "GLS has the highest delay rate at 25.0%, on only 8 deliveries.";
    expect((await phrase(QUESTION, RANKING, fakeModel(withoutUsps).client)).source).toBe("template");
    const tie = answerFor({ metric: "order_count", groupBy: "destination", sort: "desc", limit: 1 });
    expect((await phrase("Which city gets the most orders?", tie, fakeModel("Boston, MA gets the most orders, 15.").client)).source).toBe("template");
    expect((await phrase("Which city gets the most orders?", tie, fakeModel("Boston, MA and Leeds, UK tie with 15 orders each.").client)).source).toBe(
      "model",
    );
  });

  it("falls back to the template for an empty or runaway reply, and tidies a quoted one", async () => {
    const template = { sentence: templateSentence(RANKING), source: "template", cacheable: true };
    expect(await phrase(QUESTION, RANKING, fakeModel("   ").client)).toEqual(template);
    expect(await phrase(QUESTION, RANKING, fakeModel("GLS ".repeat(200)).client)).toEqual(template);
    expect(await phrase(QUESTION, RANKING, fakeModel('"GLS is a small sample; USPS leads among reliable carriers."').client)).toEqual({
      sentence: "GLS is a small sample; USPS leads among reliable carriers.",
      source: "model",
      cacheable: true,
    });
  });
});

describe("every template passes the guard against its own facts", () => {
  const specs: Record<string, unknown>[] = [
    { metric: "delayed_orders", period: { type: "previous", unit: "month" } },
    { metric: "on_time_rate" },
    { metric: "average_delivery_time", groupBy: "carrier" },
    { metric: "gross_order_value", groupBy: "month" },
    { metric: "units", groupBy: "category", sort: "asc" },
    { metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 },
    { metric: "delay_rate", groupBy: "carrier", minDelivered: 20 },
    { metric: "delay_rate", groupBy: "destination" },
    { metric: "order_count", groupBy: "destination", sort: "desc", limit: 1 },
    { metric: "order_count", groupBy: "status" },
    { metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } },
    { metric: "on_time_rate", groupBy: "month" },
    { metric: "delivery_outcomes", groupBy: "month" },
    { metric: "order_count", groupBy: "day", period: { type: "range", from: "2025-01-01", to: "2025-01-07" } },
  ];

  it.each(specs)("%j", (spec) => {
    const answer = answerFor(spec);
    expect(checkNumbers(templateSentence(answer), factsFor(answer).join("\n"))).toEqual({ ok: true });
  });
});
