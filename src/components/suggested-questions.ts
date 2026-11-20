import { EXAMPLE_QUESTIONS } from "@/tools/examples";

/**
 * The questions the pages suggest (ticket 24). Every one is in eval/questions.json, so `npm run eval`
 * checks each against the model; a test keeps it that way.
 */

/** An Overview chip and an Ask suggestion. */
const FORECAST_QUESTION = "Forecast demand for the next 3 months";

/** The four chips under the Overview's ask box (ticket 24). */
export const OVERVIEW_QUESTIONS: readonly string[] = [
  EXAMPLE_QUESTIONS.late_last_month,
  EXAMPLE_QUESTIONS.delayed_by_week,
  EXAMPLE_QUESTIONS.highest_delay_rate,
  FORECAST_QUESTION,
];

/** The Carriers page's chips (ticket 25). */
export const CARRIERS_PAGE_QUESTIONS: readonly string[] = ["Which carrier is the least reliable?", "What share of orders went through FedEx?"];

/** The Forecast page's SKU chip: a SKU is never forecast, so the answer shows its orders and its category's forecast. */
export const SKU_QUESTION = "Forecast demand for SKU CRAYON-0008";

/** The Ask page's "Try these", by group. */
export const SUGGESTED_QUESTIONS: readonly { group: string; questions: readonly string[] }[] = [
  { group: "Counts and shares", questions: [EXAMPLE_QUESTIONS.late_last_month, "What fraction of all orders used a promotion?"] },
  { group: "Over time", questions: [EXAMPLE_QUESTIONS.delayed_by_week, "Show the monthly on-time delivery rate"] },
  { group: "Rankings", questions: ["Which region takes the longest to deliver an order?", "Which carrier is the least reliable?"] },
  { group: "Forecasts", questions: [FORECAST_QUESTION, "Forecast CRAYON demand for the next 3 months"] },
];
