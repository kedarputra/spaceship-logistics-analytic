import { describe, expect, it } from "vitest";
import { type Answer, answerQuery } from "@/tools/answer";
import { factsFor, templateSentence, wordingContext } from "@/tools/sentence";
import { querySpecSchema } from "@/tools/spec";
import { AiError, type CompletionRequest, type LlmClient } from "./client";
import { checkNumbers, checkWording } from "./guard";
import { phrase } from "./phrase";
import { phraseMessages } from "./prompts";

function answerFor(spec: Record<string, unknown>): Answer {
  const answer = answerQuery(querySpecSchema.parse({ tool: "query", ...spec }));
  if (answer.kind !== "result") throw new Error(answer.message);
  return answer;
}

function fakeModel(reply: string | Error, finishReason = "stop") {
  const requests: CompletionRequest[] = [];
  const client: LlmClient = {
    complete: async (request) => {
      requests.push(request);
      if (reply instanceof Error) throw reply;
      return { text: reply, finishReason };
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

describe("sentences that pass the number guard but are wrong or cut off (ticket 22)", () => {
  const byMonth = answerFor({ metric: "on_time_rate", groupBy: "month" });
  const fastestRegion = answerFor({ metric: "average_delivery_time", groupBy: "region", sort: "asc", limit: 1 });
  const promoOrders = answerFor({ metric: "order_count", filters: { promo: ["yes"] } });
  const kept = async (answer: Answer, reply: string, finishReason = "stop") =>
    (await phrase("question", answer, fakeModel(reply, finishReason).client)).source === "model";

  it('drops a reply the token limit cut off (finish_reason "length")', async () => {
    expect(await kept(byMonth, "The on-time rate was 82.2% overall.", "length")).toBe(false);
  });

  it("drops a reply that does not end like a sentence", async () => {
    expect(await kept(byMonth, "The on-time rate was 82.2% overall")).toBe(false);
    expect(await kept(byMonth, "The on-time rate was 82.2% overall.")).toBe(true);
  });

  it('drops a direction word that contradicts the ranking: "slowest" for the fastest region', async () => {
    const [region] = fastestRegion.rows;
    if (region === undefined) throw new Error("no region");
    expect(region.label).toBe("US-W");
    const days = region.value?.toFixed(1) ?? "";
    expect(await kept(fastestRegion, `US-W has the slowest delivery time at ${days} days.`)).toBe(false);
    expect(await kept(fastestRegion, `US-W has the fastest delivery time at ${days} days.`)).toBe(true);
  });

  it("allows 'at least' beside a highest-first ranking", async () => {
    const reliableTop = answerFor({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1, minDelivered: 20 });
    expect(await kept(reliableTop, "Among carriers with at least 20 deliveries, USPS is highest at 23.4%.")).toBe(true);
  });

  it("tells the model to follow the order in the facts, copy names as written, and never call a count a share", () => {
    const system = phraseMessages("q", fastestRegion, factsFor(fastestRegion))[0]?.content ?? "";
    expect(system).toContain('Describe the first group the way the "Order" fact says');
    expect(system).toContain("Copy every name exactly as the facts write it");
    expect(system).toContain("Never call a count a share, a rate or a percentage");
  });

  it("asks for a series' overall figure, its highest and lowest point and its small samples, not every bucket", () => {
    const user = phraseMessages("q", byMonth, factsFor(byMonth))[1]?.content ?? "";
    expect(user).toContain(
      "This is a series by month: give the overall figure, the highest and lowest month as the facts name them, and any small samples; do not list every month.",
    );
    const single = phraseMessages("q", promoOrders, factsFor(promoOrders))[1]?.content ?? "";
    expect(single).not.toContain("This is a series");
  });

  it("keeps a correct sentence about a share", async () => {
    const share = answerFor({ metric: "order_share", filters: { promo: ["yes"] } });
    expect(await kept(share, "5.5% of all orders were promo orders (22 of 400).")).toBe(true);
  });

  it("keeps words that only look like a direction: least reliable, most reliable, a minimum of", async () => {
    const reliableTop = answerFor({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1, minDelivered: 20 });
    expect(await kept(reliableTop, "USPS is the least reliable carrier.")).toBe(true);
    expect(await kept(fastestRegion, "US-W is the most reliable region, needing a minimum of time.")).toBe(true);
  });

  it("drops a sentence that calls a count a share, rate or percentage", async () => {
    expect(await kept(promoOrders, "The share of orders that were promo orders is 22.")).toBe(false);
    expect(await kept(promoOrders, "The promo rate is 22.")).toBe(false);
    expect(await kept(promoOrders, "22 orders were promo orders.")).toBe(true);
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

  it.each([...specs, { metric: "average_delivery_time", groupBy: "region", sort: "asc", limit: 1 }, { metric: "order_share", groupBy: "carrier" }])(
    "%j",
    (spec) => {
      const answer = answerFor(spec);
      const sentence = templateSentence(answer);
      expect(checkNumbers(sentence, factsFor(answer).join("\n"))).toEqual({ ok: true });
      expect(checkWording(sentence, wordingContext(answer))).toEqual({ ok: true });
    },
  );
});
