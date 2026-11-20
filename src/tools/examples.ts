/**
 * Fixed texts the model may point to but never writes (ADR 0006 §8): the example questions it
 * suggests when a question is out of scope, and what each kind of out-of-scope question is told.
 * No imports, so the browser can use these too.
 */

/** ADR 0009 §8: longer questions are refused before any model call. */
export const MAX_QUESTION_LENGTH = 300;

/** When the model could not produce a valid spec, even on its retry. */
export const UNINTERPRETABLE = "That question could not be turned into a query this tool can run. Try one of these:";

export const EXAMPLE_IDS = [
  "late_last_month",
  "delayed_by_week",
  "highest_delay_rate",
  "on_time_by_region",
  "orders_by_month",
  "fastest_carrier",
  "units_by_category",
  "inventory_plan",
] as const;

export type ExampleId = (typeof EXAMPLE_IDS)[number];

export const EXAMPLE_QUESTIONS: Record<ExampleId, string> = {
  late_last_month: "How many orders were delivered late last month?",
  delayed_by_week: "Show delayed orders by week for the last 3 months",
  highest_delay_rate: "Which carrier has the highest delay rate?",
  on_time_by_region: "What is the on-time delivery rate by region?",
  orders_by_month: "How many orders were placed each month?",
  fastest_carrier: "Which carrier has the shortest average delivery time?",
  units_by_category: "How many units were ordered per product category last quarter?",
  inventory_plan: "How much inventory should I plan for the next 3 months?",
};

export const UNSUPPORTED_REASON_IDS = [
  "two_breakdowns",
  "numeric_filter",
  "sku_breakdown",
  "follow_up",
  "not_about_data",
  "unclear",
  "other",
] as const;

export type UnsupportedReason = (typeof UNSUPPORTED_REASON_IDS)[number];

/** What an out-of-scope question is told, by reason. */
export const UNSUPPORTED_REASONS: Record<UnsupportedReason, string> = {
  two_breakdowns: "Breaking a result down by two things at once isn't supported; ask for one breakdown at a time.",
  numeric_filter: "Filters on numbers, such as orders with more than 5 units, aren't supported.",
  sku_breakdown: "Results can be filtered by one SKU but not broken down by SKU: there are 355 of them.",
  follow_up: 'Each question stands on its own, so a follow-up like "and for UPS?" can\'t be answered. Ask the whole question.',
  not_about_data: "That question isn't about this logistics data.",
  unclear: "The question isn't clear enough to answer without guessing.",
  other: "That question is outside what this tool can answer.",
};
