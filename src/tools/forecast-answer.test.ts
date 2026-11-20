import { describe, expect, it } from "vitest";
import { answerForecast, type ForecastAnswer, forecastFacts, presentForecast, requiredForecastWords } from "./forecast-answer";
import { forecastResultFor, ROUGH_SERIES } from "./forecast-fixtures";
import { forecastSpecSchema } from "./spec";

function forecastFor(horizon?: Record<string, unknown>): ForecastAnswer {
  const answer = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" }, ...(horizon === undefined ? {} : { horizon }) }));
  if (answer.kind !== "forecast") throw new Error(answer.message);
  return answer;
}

/** WAPE 125%: rough. */
function roughForecast(): ForecastAnswer {
  return presentForecast(forecastResultFor(ROUGH_SERIES));
}

describe("the forecast answer's sentence, written by code (ADR 0003 §7, ADR 0009 §4)", () => {
  it("gives the forecast, the safety stock and the units to plan for over the months forecast", () => {
    const answer = forecastFor();
    expect(answer.sentence).toBe(
      "Over Jan–Mar 2026, demand is forecast at 285 units; with 120 units of safety stock, that is 405 units to plan for.",
    );
    expect(answer.sentenceSource).toBe("template");
    expect(forecastFor({ count: 4, unit: "month" }).sentence).toBe(
      "Over Jan–Apr 2026, demand is forecast at 380 units; with 138 units of safety stock, that is 518 units to plan for.",
    );
  });

  it("says a forecast is rough when its error is over half of actual demand", () => {
    const rough = roughForecast();
    expect(rough.roughNote).toBe("This forecast is rough: its error on Oct–Dec 2025 was 125.0% of actual demand.");
    expect(rough.sentence).toMatch(/ This forecast is rough: its error on Oct–Dec 2025 was 125\.0% of actual demand\.$/);
    expect(requiredForecastWords(rough)).toEqual(["rough"]);
    expect(requiredForecastWords(forecastFor())).toEqual([]);
    expect(forecastFor().roughNote).toBeUndefined();
  });

  it("says why a forecast is rough when the held-out months had no demand", () => {
    expect(presentForecast(forecastResultFor([10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 0, 0])).roughNote).toBe(
      "This forecast is rough: Oct–Dec 2025 had no demand, and the forecast for them was not 0.",
    );
  });

  it("states what was forecast, from which history", () => {
    expect(forecastFor().interpretation).toBe(
      "Demand forecast for all products: units ordered per month by order date, Jan–Mar 2026, from orders 1 Jan–31 Dec 2025.",
    );
  });
});

describe("the forecast's facts block, which a model sentence is checked against", () => {
  const facts = forecastFacts(forecastFor());

  it("holds the figures a sentence may use, formatted as the card shows them on screen", () => {
    expect(facts).toEqual([
      "Forecast: units ordered per month by order date, all products, from orders 1 Jan–31 Dec 2025.",
      "Months forecast: Jan–Mar 2026 (3 months).",
      "Forecast per month: Jan 2026 95.0, Feb 2026 95.0, Mar 2026 95.0.",
      "95% range per month: Jan 2026 13.4–176.6, Feb 2026 0.0–210.5, Mar 2026 0.0–236.4.",
      "Forecast demand over Jan–Mar 2026: 285 units.",
      "Safety stock: 120 units (95% service level).",
      "Units to plan for: 405. This is not a reorder quantity: the data has no stock on hand.",
      "Method: 3-month moving average. On this series the 3-month moving average had the lowest error on Oct–Dec 2025: the forecast is the mean of the last 3 months, 95.0 units a month.",
      "Error on Oct–Dec 2025: 16.2 units a month on average, 17.1% of actual demand.",
      "Rough: no.",
      "January: January 2025's spike is outside the 3-month window, so the forecast does not repeat it. One year of data cannot show whether January repeats.",
    ]);
  });

  it("adds the horizon notes", () => {
    expect(forecastFacts(forecastFor({ count: 6, unit: "week" }))).toContain("Note: The forecast is monthly, so 6 weeks is shown as 2 months.");
  });
});

describe("forecast scopes not available yet", () => {
  it("answers a category, warehouse, region or SKU forecast with a message", () => {
    const answer = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "category", value: "CRAYON" } }));
    expect(answer).toEqual({ kind: "unavailable", message: expect.stringContaining("not available yet") });
  });
});
