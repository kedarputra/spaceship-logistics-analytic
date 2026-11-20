import { describe, expect, it } from "vitest";
import { type Answer, answerQuery } from "@/tools/answer";
import { type ForecastAnswer, forecastFacts, forecastWordingContext, presentForecast } from "@/tools/forecast-answer";
import { forecastAnswerOf, forecastResultFor, ROUGH_SERIES } from "@/tools/forecast-fixtures";
import { factsFor, templateSentence, wordingContext } from "@/tools/sentence";
import { querySpecSchema } from "@/tools/spec";
import { AiError, type CompletionRequest, type LlmClient } from "./client";
import { checkForecastWording, checkNumbers, checkWording } from "./guard";
import { phrase, templateAfterFailedCall } from "./phrase";
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
/** The trace never repeats the model's number, only what kind it was (ticket 17). */
const WORDS = "a number in words or a multiplier";
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
    expect(prompt).toContain("The highest group, GLS, is a small sample");
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
      rejectedBecause: "a number not in the facts",
    });
  });

  it("falls back to the template for a number in words or a multiplier", async () => {
    const template = { sentence: templateSentence(RANKING), source: "template", cacheable: true };
    expect(await phrase(QUESTION, RANKING, fakeModel("GLS is late twice as often as USPS.").client)).toEqual({ ...template, rejectedBecause: WORDS });
    expect(await phrase(QUESTION, RANKING, fakeModel("Three carriers do worse than average.").client)).toEqual({
      ...template,
      rejectedBecause: WORDS,
    });
  });

  it("falls back to the template when the call fails, marks that sentence not worth caching, and says why", async () => {
    const failed = { sentence: templateSentence(RANKING), source: "template", cacheable: false };
    expect(await phrase(QUESTION, RANKING, fakeModel(new AiError("busy")).client)).toEqual({ ...failed, rejectedBecause: "the model was busy" });
    expect(await phrase(QUESTION, RANKING, fakeModel(new AiError("unavailable")).client)).toEqual({ ...failed, rejectedBecause: "the model was unavailable" });
    expect(await phrase(QUESTION, RANKING, fakeModel(new Error("socket hang up")).client)).toEqual({ ...failed, rejectedBecause: "the model call failed" });
  });

  it("gives the template when the AI is not configured, before any call (ticket 17)", () => {
    expect(templateAfterFailedCall(RANKING, new AiError("not-configured"))).toEqual({
      sentence: templateSentence(RANKING),
      source: "template",
      cacheable: false,
      rejectedBecause: "the AI is not configured",
    });
  });

  it("falls back to the template when the sentence leaves out a group it must name (ADR 0001 §6, ties)", async () => {
    const withoutUsps = "GLS has the highest delay rate at 25.0%, on only 8 deliveries.";
    // USPS and its value are both missing; the longest required word is checked first.
    expect(await phrase(QUESTION, RANKING, fakeModel(withoutUsps).client)).toMatchObject({ source: "template", rejectedBecause: 'leaves out "23.4%"' });
    const tie = answerFor({ metric: "order_count", groupBy: "destination", sort: "desc", limit: 1 });
    expect((await phrase("Which city gets the most orders?", tie, fakeModel("Boston, MA gets the most orders, 15.").client)).source).toBe("template");
    expect((await phrase("Which city gets the most orders?", tie, fakeModel("Boston, MA and Leeds, UK tie with 15 orders each.").client)).source).toBe(
      "model",
    );
  });

  it("falls back to the template for an empty or runaway reply, and tidies a quoted one", async () => {
    const template = { sentence: templateSentence(RANKING), source: "template", cacheable: true };
    expect(await phrase(QUESTION, RANKING, fakeModel("   ").client)).toEqual({ ...template, rejectedBecause: "an empty reply" });
    expect(await phrase(QUESTION, RANKING, fakeModel("GLS ".repeat(200)).client)).toEqual({ ...template, rejectedBecause: "longer than 400 characters" });
    expect(await phrase(QUESTION, RANKING, fakeModel('"GLS is a small sample; USPS leads among reliable carriers at 23.4%."').client)).toEqual({
      sentence: "GLS is a small sample; USPS leads among reliable carriers at 23.4%.",
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

  it("says why each dropped sentence was dropped, for the pipeline trace (ticket 17)", async () => {
    const reason = async (answer: Answer, reply: string, finishReason = "stop") => {
      const phrased = await phrase("question", answer, fakeModel(reply, finishReason).client);
      return phrased.source === "template" ? phrased.rejectedBecause : undefined;
    };
    expect(await reason(byMonth, "The on-time rate was 82.2% overall.", "length")).toBe("cut off by the token limit");
    expect(await reason(byMonth, "The on-time rate was 82.2% overall")).toBe("does not end like a sentence");
    expect(await reason(fastestRegion, "US-W has the slowest delivery time.")).toBe('"slowest" contradicts the lowest first ranking');
    expect(await reason(byMonth, "The on-time rate was 82.2% overall.")).toBeUndefined();
  });

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

function forecastAnswer(horizon?: Record<string, unknown>): ForecastAnswer {
  return forecastAnswerOf({ scope: { type: "total" }, ...(horizon === undefined ? {} : { horizon }) });
}

/** WAPE 125%: a rough forecast. */
function roughForecastAnswer(): ForecastAnswer {
  return presentForecast(forecastResultFor(ROUGH_SERIES));
}

describe("phrase: a forecast → its opening sentence, with the same guard and fallbacks", () => {
  const FORECAST_QUESTION = "How much stock should we plan for the next 3 months?";
  const forecast = forecastAnswer();
  const keptForecast = async (answer: ForecastAnswer, reply: string) =>
    (await phrase(FORECAST_QUESTION, answer, fakeModel(reply).client)).source === "model";

  it("asks with the question, the forecast in words and its facts, and says how to word the plan", async () => {
    const { client, requests } = fakeModel("Over Jan–Mar 2026, demand is forecast at 285 units, so plan for 405 units.");
    await phrase(FORECAST_QUESTION, forecast, client);
    expect(requests[0]?.temperature).toBe(0.2);
    const [system, user] = (requests[0]?.messages ?? []).map((message) => message.content);
    expect(user).toContain(FORECAST_QUESTION);
    expect(user).toContain(forecast.interpretation);
    for (const fact of forecastFacts(forecast)) expect(user).toContain(fact);
    expect(system).toContain('"units to plan for"');
    expect(system).toContain("When the facts say the forecast is rough, say so");
  });

  it("keeps a sentence whose numbers are all in the facts", async () => {
    const sentence = "Over Jan–Mar 2026, demand is forecast at 285 units, 95.0 a month; with 120 units of safety stock, plan for 405 units.";
    expect(await phrase(FORECAST_QUESTION, forecast, fakeModel(sentence).client)).toEqual({ sentence, source: "model", cacheable: true });
  });

  it("falls back to the template for a number the forecast did not produce, or when the call fails", async () => {
    expect(await phrase(FORECAST_QUESTION, forecast, fakeModel("Plan for 400 units over Jan–Mar 2026.").client)).toEqual({
      sentence: forecast.sentence,
      source: "template",
      cacheable: true,
      rejectedBecause: "a number not in the facts",
    });
    expect(await phrase(FORECAST_QUESTION, forecast, fakeModel(new AiError("busy")).client)).toEqual({
      sentence: forecast.sentence,
      source: "template",
      cacheable: false,
      rejectedBecause: "the model was busy",
    });
  });

  it("drops a sentence that turns the plan into an order to place (ADR 0003 §7)", async () => {
    expect(await keptForecast(forecast, "Reorder 405 units for Jan–Mar 2026.")).toBe(false);
    expect(await keptForecast(forecast, "You should buy 405 units for Jan–Mar 2026.")).toBe(false);
    expect(await keptForecast(forecast, "There are 405 units to plan for over Jan–Mar 2026.")).toBe(true);
  });

  it("drops a sentence about a rough forecast that does not say it is rough (ADR 0003 §4)", async () => {
    const rough = roughForecastAnswer();
    const plan = `${rough.recommendation.units}`;
    expect(await keptForecast(rough, `Plan for ${plan} units over ${rough.monthsLabel}.`)).toBe(false);
    expect(await keptForecast(rough, `Plan for ${plan} units over ${rough.monthsLabel}, but this forecast is rough.`)).toBe(true);
  });

  it("passes the guard with its own template, for every horizon, scope, SKU and target", () => {
    const answers = [
      forecast,
      forecastAnswer({ count: 6, unit: "month" }),
      forecastAnswer({ count: 6, unit: "week" }),
      roughForecastAnswer(),
      forecastAnswerOf({ scope: { type: "category", value: "CRAYON" } }),
      forecastAnswerOf({ scope: { type: "region", value: "UK" } }),
      forecastAnswerOf({ scope: { type: "sku", value: "CRAYON-0008" } }),
      forecastAnswerOf({ scope: { type: "total" }, target: { type: "year", year: 2027 } }),
      forecastAnswerOf({ scope: { type: "total" }, target: { type: "quarter", quarter: 2 } }),
      forecastAnswerOf({ scope: { type: "total" }, target: { type: "month", month: 3 } }),
      forecastAnswerOf({ scope: { type: "warehouse", value: "LON-FC1" }, target: { type: "month", month: 2 } }),
      forecastAnswerOf({ scope: { type: "sku", value: "crayon-0008" }, target: { type: "quarter", quarter: 2 } }),
    ];
    for (const answer of answers) {
      expect(checkNumbers(answer.sentence, forecastFacts(answer).join("\n"))).toEqual({ ok: true });
      expect(checkForecastWording(answer.sentence, forecastWordingContext(answer))).toEqual({ ok: true });
    }
  });
});

describe("phrase: a forecast for one scope or a SKU (ticket 14)", () => {
  const crayon = forecastAnswerOf({ scope: { type: "category", value: "CRAYON" } });
  const sku = forecastAnswerOf({ scope: { type: "sku", value: "CRAYON-0008" } });
  const kept = async (answer: ForecastAnswer, reply: string) =>
    (await phrase("How many crayons should we plan for?", answer, fakeModel(reply).client)).source === "model";

  it("drops a sentence that does not name the category, warehouse or region forecast", async () => {
    expect(await kept(crayon, "Plan for 55 units over Jan–Mar 2026.")).toBe(false);
    expect(await kept(crayon, "Plan for 55 units of CRAYON over Jan–Mar 2026.")).toBe(true);
  });

  it("drops a SKU sentence that names the SKU but not its category, though the SKU's ID contains it", async () => {
    expect(await kept(sku, "CRAYON-0008 has too few orders to forecast; plan for 55 units over Jan–Mar 2026.")).toBe(false);
    expect(await kept(sku, "CRAYON-0008 has too few orders to forecast; for its category CRAYON, plan for 55 units over Jan–Mar 2026.")).toBe(true);
  });

  it("drops a SKU sentence that copies the question's casing, crayon-0008, instead of the ID as the data writes it (ticket 23)", async () => {
    const lower = forecastAnswerOf({ scope: { type: "sku", value: "crayon-0008" } });
    expect(await kept(lower, "crayon-0008 cannot be forecast on its own; for its category CRAYON, plan for 55 units over Jan–Mar 2026.")).toBe(false);
    expect(await kept(lower, "CRAYON-0008 cannot be forecast on its own; for its category CRAYON, plan for 55 units over Jan–Mar 2026.")).toBe(true);
  });

  it("drops a sentence about months asked about inside the reach that gives only the plan, not their own demand (ticket 23)", async () => {
    const q2 = forecastAnswerOf({ scope: { type: "total" }, target: { type: "quarter", quarter: 2 } });
    expect(await kept(q2, "Over Jan–Jun 2026, demand is forecast at 570 units; with 169 units of safety stock, that is 739 units to plan for.")).toBe(false);
    expect(await kept(q2, "In Q2 2026, demand is forecast at 285 units; to have stock through Jun 2026, plan for 739 units.")).toBe(true);
  });

  it("asks for a sentence in the template's shape, a SKU's reason first, and the reach first when the months asked lie beyond it", async () => {
    const { client, requests } = fakeModel("CRAYON-0008 cannot be forecast; plan for 55 units of CRAYON.");
    await phrase("How many CRAYON-0008 should we plan for?", sku, client);
    const system = requests[0]?.messages[0]?.content ?? "";
    expect(system).toContain(
      'For example (made-up numbers): "Over Apr–Jun 2026, demand is forecast at 120 units; with 45 units of safety stock, that is 165 units to plan for."',
    );
    expect(system).toContain("For a SKU, say first that it cannot be forecast on its own and why, then give its category's forecast, naming both.");
    // The card shows the reach first, written by code; a model sentence repeating it reads twice (live check).
    expect(system).toContain(
      "When the facts open with how far the forecast reaches, the answer already shows that sentence first: do not repeat it; give the forecast for the months it covers.",
    );
  });
});

describe("the small-sample companion and tied points, from the live check after ticket 22 (ticket 23)", () => {
  // "Which carrier is the least reliable?": GLS 62.5% (5 of 8) is a small sample; USPS 74.5% (35 of 47) is the lowest with 20 or more.
  const leastReliable = answerFor({ metric: "on_time_rate", groupBy: "carrier", sort: "asc", limit: 1, assumption: "best" });
  const delayedByWeek = answerFor({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } });
  const kept = async (answer: Answer, reply: string) => (await phrase("question", answer, fakeModel(reply).client)).source === "model";

  it("drops the live sentence that named USPS without its value and called the lowest group top", async () => {
    const live = "GLS is the least reliable with 62.5% (5 of 8), which is a small sample. USPS is the top among groups with at least 20 delivered orders.";
    expect(await kept(leastReliable, live)).toBe(false);
  });

  it("requires the companion's value, exactly as formatted", async () => {
    expect(await kept(leastReliable, "GLS is lowest at 62.5% (5 of 8), a small sample; USPS is lowest among carriers with at least 20 deliveries.")).toBe(false);
    expect(
      await kept(leastReliable, "GLS has the lowest on-time rate at 62.5% (5 of 8), on only 8 deliveries; among carriers with at least 20, USPS is lowest at 74.5% (35 of 47)."),
    ).toBe(true);
  });

  it('rejects "top" and "highest" for a lowest-first ranking, and "bottom" and "lowest" for a highest-first one', async () => {
    const usps = "among carriers with at least 20, USPS is at 74.5% (35 of 47)";
    expect(await kept(leastReliable, `GLS is at the top with 62.5% (5 of 8), a small sample; ${usps}.`)).toBe(false);
    expect(await kept(leastReliable, `GLS is lowest at 62.5% (5 of 8), a small sample; ${usps}.`)).toBe(true);
    expect(await kept(RANKING, "GLS is at the bottom at 25.0%, on only 8 deliveries; USPS has 23.4% among carriers with at least 20.")).toBe(false);
    expect(await kept(RANKING, "GLS is at the top at 25.0%, on only 8 deliveries; among carriers with at least 20, USPS has 23.4%.")).toBe(true);
  });

  it("names the first group by the ranking's direction in the facts and the prompt, never \"Top\" for the lowest", () => {
    const facts = factsFor(leastReliable);
    expect(facts).toContain("Lowest: GLS: 62.5% (5 of 8), a small sample");
    expect(facts).toContain("Lowest with at least 20 delivered orders: USPS: 74.5% (35 of 47)");
    expect(facts.some((fact) => fact.startsWith("Top"))).toBe(false);
    const user = phraseMessages("Which carrier is the least reliable?", leastReliable, facts)[1]?.content ?? "";
    expect(user).toContain(
      "The lowest group, GLS, is a small sample: say so, and also give USPS, the lowest among groups with at least 20 delivered orders, with its value as the facts give it.",
    );
  });

  it("drops the live sentence that listed 7 tied weeks, and keeps one that counts them", async () => {
    const live =
      "There were 10 delayed orders over the 14 weeks; the lowest weeks were w/c 29 Sep, w/c 20 Oct, w/c 27 Oct, w/c 10 Nov, w/c 24 Nov, w/c 22 Dec and w/c 29 Dec with 0.";
    expect(await kept(delayedByWeek, live)).toBe(false);
    const counted = "There were 10 delayed orders over the 14 weeks, the most in w/c 6 Oct, w/c 17 Nov and w/c 15 Dec (2 each), and none in 7 of the 14 weeks.";
    expect(await kept(delayedByWeek, counted)).toBe(true);
  });

  it("gives tied points in the facts as at most three names and a count", () => {
    expect(factsFor(delayedByWeek)).toContain("Fewest: 7 of the 14 weeks, including w/c 29 Sep, w/c 20 Oct and w/c 27 Oct (0 each)");
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
