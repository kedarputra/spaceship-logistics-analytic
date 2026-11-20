import { z } from "zod";
import type { Answer } from "@/tools/answer";
import { EXAMPLE_IDS, UNSUPPORTED_REASONS } from "@/tools/examples";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import { DIMENSION_VALUES, type Interpretation, interpretationSchema, isTimeDimension, METRIC_GUIDE } from "@/tools/spec";
import { DIMENSION_WORDS } from "@/tools/words";
import type { ChatMessage } from "./client";

/**
 * The interpretation prompt (ADR 0009 §10): the schema, the allowed values, one-line metric
 * definitions, and worked examples that paraphrase the R3 questions. It never gives the anchor
 * date: periods stay symbolic and code resolves them (ADR 0002 §1). Bump PROMPT_VERSION whenever
 * this file changes, so cached interpretations from the old prompt are not reused.
 */
export const PROMPT_VERSION = "prompts-6";

let jsonSchema: unknown;

/** The model's response schema, derived from the whitelist so the two cannot drift apart. */
export function interpretationJsonSchema(): unknown {
  jsonSchema ??= z.toJSONSchema(interpretationSchema);
  return jsonSchema;
}

export const PROMPT_EXAMPLES: readonly { question: string; spec: Interpretation }[] = [
  {
    question: "How many deliveries were late in November?",
    spec: { tool: "query", metric: "delayed_orders", period: { type: "month", month: 11 }, assumption: "late" },
  },
  {
    question: "Count delayed shipments per week over the past 2 months",
    spec: { tool: "query", metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 2, unit: "month" } },
  },
  {
    question: "Which carrier is delayed most often?",
    spec: { tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 },
  },
  {
    question: "Who is the best carrier this quarter?",
    spec: {
      tool: "query",
      metric: "on_time_rate",
      groupBy: "carrier",
      sort: "desc",
      limit: 1,
      period: { type: "this", unit: "quarter" },
      assumption: "best",
    },
  },
  {
    question: "Orders from London to Austin shipped with UPS",
    spec: { tool: "query", metric: "order_count", filters: { origin: ["London, UK"], destination: ["Austin, TX"], carrier: ["UPS"] } },
  },
  {
    question: "How many orders had status delivered last quarter?",
    spec: { tool: "query", metric: "order_count", filters: { status: ["delivered"] }, period: { type: "previous", unit: "quarter" } },
  },
  {
    question: "Delayed orders that were placed in March",
    spec: { tool: "query", metric: "delayed_orders", period: { type: "month", month: 3 }, dateField: "order_date" },
  },
  {
    question: "Average delivery time by region in the last 30 days",
    spec: { tool: "query", metric: "average_delivery_time", groupBy: "region", period: { type: "last_days", days: 30 } },
  },
  {
    question: "What percentage of orders were shipped with FedEx?",
    spec: { tool: "query", metric: "order_share", filters: { carrier: ["FedEx"] } },
  },
  {
    question: "How much inventory should we plan for next quarter?",
    spec: { tool: "forecast", scope: { type: "total" }, horizon: { count: 3, unit: "month" } },
  },
  {
    question: "How much stock will we need in 2027?",
    spec: { tool: "forecast", scope: { type: "total" }, target: { type: "year", year: 2027 } },
  },
  {
    question: "Forecast crayon demand for the next 2 months",
    spec: { tool: "forecast", scope: { type: "category", value: "CRAYON" }, horizon: { count: 2, unit: "month" } },
  },
  {
    question: "How much stock should warehouse LON-FC1 plan for?",
    spec: { tool: "forecast", scope: { type: "warehouse", value: "LON-FC1" } },
  },
  {
    question: "Orders with more than 5 units, by region and by carrier",
    spec: { tool: "unsupported", reason: "numeric_filter", examples: ["orders_by_month", "on_time_by_region", "units_by_category"] },
  },
  {
    question: "What's the weather in Berlin?",
    spec: { tool: "unsupported", reason: "not_about_data", examples: ["late_last_month", "highest_delay_rate", "inventory_plan"] },
  },
];

function systemPrompt(): string {
  const metrics = METRIC_GUIDE.map((metric) => `- ${metric.id}: ${metric.definition} Dated by ${metric.dateField}.`).join("\n");
  const values = Object.entries(DIMENSION_VALUES)
    .map(([dimension, list]) => `- ${dimension}: ${list.join(", ")}`)
    .join("\n");
  const reasons = Object.entries(UNSUPPORTED_REASONS)
    .map(([reason, text]) => `- ${reason}: ${text}`)
    .join("\n");
  // By id only: the ids say what each question is about, and the R3 questions never sit in the prompt word for word.
  const examples = EXAMPLE_IDS.join(", ");
  const worked = PROMPT_EXAMPLES.map((example) => `Question: ${example.question}\nJSON: ${JSON.stringify(example.spec)}`).join("\n\n");

  return `You turn one question about a dataset of 400 logistics orders from 2025 into one JSON object that matches the schema below. You never answer the question and never compute a number or a date: code validates your JSON and computes the answer.

Choose "tool":
- "query" for counts, rates, averages, sums, rankings and breakdowns of past orders.
- "forecast" for future demand or how much inventory to plan: the total, one category, one warehouse, one region, or one SKU.
- "unsupported" for anything else, with the reason and exactly 3 example ids from the list below.

Rules for a query:
- Use only the metrics, dimensions and values listed. At most one groupBy. SKU is a filter, never a groupBy.
- Periods are symbolic; never write today's date or work out dates. "last month" = {"type":"previous","unit":"month"}; "last 3 months" = {"type":"last","count":3,"unit":"month"}; "this year" = {"type":"this","unit":"year"}; "last 30 days" = {"type":"last_days","days":30}; "March" = {"type":"month","month":3}; "Q3" = {"type":"quarter","quarter":3}; dates written in the question = {"type":"range","from":"YYYY-MM-DD","to":"YYYY-MM-DD"}. No period mentioned: leave "period" out.
- Set "dateField":"order_date" only when the question says the orders were placed or ordered in the period.
- "highest", "lowest", "top N": sort ("desc" or "asc") and limit.
- Direction: for delivery time, "slowest", "longest" and "worst" mean the most days ("sort":"desc"); "fastest", "quickest" and "shortest" mean the fewest days ("sort":"asc"). For rates and counts, "highest", "most" and "top" are "desc"; "lowest", "fewest" and "bottom" are "asc".
- "share", "percentage" or "what part" of orders is order_share, with the filter or groupBy that picks the orders; never an order count. A percentage delivered on time, delayed or with an exception is on_time_rate or delay_rate, never order_share: those divide by delivered orders.
- Ambiguous words: "best" means the on-time rate, highest first, with "assumption":"best"; "performance" means the on-time rate with "assumption":"performance"; "late" or "delivered late" means delayed_orders with "assumption":"late".
- "Orders with status X" is order_count with a status filter.
- Cities may be written by their short name ("Austin").

Rules for a forecast:
- "scope":{"type":"total"} for demand or inventory overall; a category, warehouse, region or SKU only when the question names one.
- A forecast covers one thing: the total, one category, one warehouse or one region. A question that combines two, such as crayons at LON-FC1, is unsupported with reason "forecast_combination".
- "next 2 months" = {"count":2,"unit":"month"}; "next quarter" = {"count":3,"unit":"month"}; "next 6 weeks" = {"count":6,"unit":"week"}. No horizon mentioned: leave "horizon" out.
- Months named in the question are a "target", never a horizon: "in 2027" = {"type":"year","year":2027}; "in Q2" = {"type":"quarter","quarter":2}; "in March 2026" = {"type":"month","month":3,"year":2026}. Leave the year out when the question does. Never give both "horizon" and "target".

Metrics:
${metrics}

Dimension values:
${values}
- destination: one of 47 cities, written like "Austin, TX".
- client: ids like "CL-1001".
- sku: ids like "CRAYON-0008" (filter only).

Reasons a question is unsupported:
${reasons}

Example question ids for unsupported answers (pick the 3 closest to what was asked):
${examples}

Worked examples:

${worked}

Schema:
${JSON.stringify(interpretationJsonSchema())}

Reply with the JSON object only.`;
}

export function interpretMessages(question: string): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt() },
    { role: "user", content: question },
  ];
}

/** ADR 0001 §6, in words for the phrase call. */
function smallSampleCase(answer: Answer): string {
  const { ranking } = answer;
  if (ranking === undefined) return "No ranking: nothing to flag.";
  switch (ranking.case) {
    case "reliable":
      return `The top group, ${ranking.top.label}, has at least ${ranking.minDelivered} delivered orders, so it can be named as the top.`;
    case "small-sample-top":
      return `The top group, ${ranking.top.label}, is a small sample: say so, and also name ${ranking.topReliable?.label ?? "the top group"} as the top among groups with at least ${ranking.minDelivered} delivered orders.`;
    case "no-reliable-group":
      return `No group has at least ${ranking.minDelivered} delivered orders: name no winner, say the ranking is not reliable, and mention the top group only as a small sample.`;
  }
}

// The number rules every sentence follows, checked afterwards by the number guard (ADR 0009 §4).
const NUMBER_RULES = `- Use only numbers that appear in the facts, written exactly as they appear there: the same digits, decimals, commas and % sign.
- Write every number as digits. Never write a number as a word, and never say "twice", "half", "double" or the like.
- Compute nothing: no sums, differences, averages or percentages that are not already in the facts.`;

const PLAIN_TEXT_RULE = "- Plain text only: no markdown, no lists, no greeting, no quotes around the answer. End with a full stop.";

const PHRASE_SYSTEM = `You write the opening of an answer about a dataset of logistics orders: one or two plain sentences that answer the question from the facts you are given.
${NUMBER_RULES}
- When the facts flag a small sample, say so.
- Name every group tied at the top, and, when the top group is a small sample, also the top group with enough deliveries.
- Describe the first group the way the "Order" fact says: with "lowest first" it is the lowest, fewest or fastest, never the highest, most or slowest; with "highest first" the other way round.
- Copy every name exactly as the facts write it, not as the question spells it.
- Never call a count a share, a rate or a percentage.
${PLAIN_TEXT_RULE}`;

const FORECAST_PHRASE_SYSTEM = `You write the opening of an answer about a demand forecast for a dataset of logistics orders: one or two plain sentences that answer the question from the facts you are given.
${NUMBER_RULES}
- Give the months forecast, the forecast demand, and the units to plan for with the safety stock in them, in your own words. For example (made-up numbers): "Over Apr–Jun 2026, demand is forecast at 120 units; with 45 units of safety stock, that is 165 units to plan for."
- Call the plan "units to plan for". Never call it an order, a reorder, a purchase or stock to buy: the data has no stock on hand.
- For one category, warehouse or region, name it as the facts write it.
- For a SKU, say first that it cannot be forecast on its own and why, then give its category's forecast, naming both.
- When the facts open with how far the forecast reaches, the answer already shows that sentence first: do not repeat it; give the forecast for the months it covers.
- When the facts say the forecast is rough, say so with the word "rough".
${PLAIN_TEXT_RULE}`;

/** For a series over time: the overall figure and the extremes, not a list of every bucket (ticket 22). */
function seriesInstruction(answer: Answer): string[] {
  const groupBy = answer.spec.groupBy;
  if (groupBy === undefined || !isTimeDimension(groupBy)) return [];
  const unit = DIMENSION_WORDS[groupBy].one;
  return [`This is a series by ${unit}: give the overall figure, the highest and lowest ${unit} as the facts name them, and any small samples; do not list every ${unit}.`];
}

/** The phrase call (ADR 0009 §4, §10): the question, the spec in words, the definition, the small-sample case, and the facts. */
export function phraseMessages(question: string, answer: Answer, facts: readonly string[]): ChatMessage[] {
  const content = [
    `Question: ${question}`,
    `What was computed: ${answer.interpretation}`,
    `Definition: ${answer.metric.definition}`,
    `Small-sample case: ${smallSampleCase(answer)}`,
    ...seriesInstruction(answer),
    "Facts:",
    ...facts,
  ].join("\n");
  return [
    { role: "system", content: PHRASE_SYSTEM },
    { role: "user", content },
  ];
}

/** The phrase call for a forecast: the question, the forecast in words, and its facts. */
export function forecastPhraseMessages(question: string, answer: ForecastAnswer, facts: readonly string[]): ChatMessage[] {
  const content = [`Question: ${question}`, `What was computed: ${answer.interpretation}`, "Facts:", ...facts].join("\n");
  return [
    { role: "system", content: FORECAST_PHRASE_SYSTEM },
    { role: "user", content },
  ];
}

/** The AI health check's 1-token call (ADR 0009 §11): any reply means the model answers. */
export const HEALTH_PING: readonly ChatMessage[] = [{ role: "user", content: "Reply with OK." }];

/** The one retry (ADR 0009 §3): the model's reply, and what the validator found wrong with it. */
export function retryMessages(question: string, reply: string, problems: readonly string[]): ChatMessage[] {
  return [
    ...interpretMessages(question),
    { role: "assistant", content: reply },
    { role: "user", content: `That reply was not valid: ${problems.join("; ")}. Reply again with one JSON object that matches the schema.` },
  ];
}
