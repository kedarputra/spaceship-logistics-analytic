import { z } from "zod";
import { EXAMPLE_IDS, UNSUPPORTED_REASONS } from "@/tools/examples";
import { DIMENSION_VALUES, type Interpretation, interpretationSchema, METRIC_GUIDE } from "@/tools/spec";
import type { ChatMessage } from "./client";

/**
 * The interpretation prompt (ADR 0009 §10): the schema, the allowed values, one-line metric
 * definitions, and worked examples that paraphrase the R3 questions. It never gives the anchor
 * date: periods stay symbolic and code resolves them (ADR 0002 §1). Bump PROMPT_VERSION whenever
 * this file changes, so cached interpretations from the old prompt are not reused.
 */
export const PROMPT_VERSION = "interpret-1";

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
- Ambiguous words: "best" means the on-time rate, highest first, with "assumption":"best"; "performance" means the on-time rate with "assumption":"performance"; "late" or "delivered late" means delayed_orders with "assumption":"late".
- "Orders with status X" is order_count with a status filter.
- Cities may be written by their short name ("Austin").

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

/** The one retry (ADR 0009 §3): the model's reply, and what the validator found wrong with it. */
export function retryMessages(question: string, reply: string, problems: readonly string[]): ChatMessage[] {
  return [
    ...interpretMessages(question),
    { role: "assistant", content: reply },
    { role: "user", content: `That reply was not valid: ${problems.join("; ")}. Reply again with one JSON object that matches the schema.` },
  ];
}
