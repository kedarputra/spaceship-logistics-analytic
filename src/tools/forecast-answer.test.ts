import { describe, expect, it } from "vitest";
import { answerForecast, type ForecastAnswer, forecastFacts, forecastWordingContext, presentForecast, requiredForecastWords } from "./forecast-answer";
import { forecastAnswerOf, forecastResultFor, ROUGH_SERIES } from "./forecast-fixtures";
import { forecastSpecSchema } from "./spec";

function forecastFor(horizon?: Record<string, unknown>): ForecastAnswer {
  return forecastAnswerOf({ scope: { type: "total" }, ...(horizon === undefined ? {} : { horizon }) });
}

const CRAYON = { scope: { type: "category", value: "CRAYON" } };
const CRAYON_0008 = { scope: { type: "sku", value: "CRAYON-0008" } };

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
    expect(forecastAnswerOf(CRAYON_0008).interpretation).toBe(
      "Demand forecast for category CRAYON, the category of SKU CRAYON-0008: units ordered per month by order date, Jan–Mar 2026, from orders 1 Jan–31 Dec 2025.",
    );
  });
});

describe("months asked about inside the reach (ticket 23)", () => {
  const q2 = forecastAnswerOf({ scope: { type: "total" }, target: { type: "quarter", quarter: 2 } });

  it("answers the question first: the target's own demand, then the units to plan for through its end", () => {
    expect(q2.targetDemand).toEqual({ label: "Q2 2026", monthsLabel: "Apr–Jun 2026", units: 285 });
    expect(q2.sentence).toBe(
      "In Q2 2026 (Apr–Jun 2026), demand is forecast at 285 units. Over Jan–Jun 2026, demand is forecast at 570 units; with 169 units of safety stock, that is 739 units to plan for, to have stock through Jun 2026.",
    );
  });

  it("puts both figures in the facts, and gives the wording check the target's names and demand", () => {
    const facts = forecastFacts(q2);
    expect(facts).toContain("In Q2 2026 (Apr–Jun 2026), demand is forecast at 285 units.");
    expect(facts).toContain("Over Jan–Jun 2026, demand is forecast at 570 units.");
    expect(forecastWordingContext(q2)).toEqual({ target: { labels: ["Q2 2026", "Apr–Jun 2026"], units: "285" } });
  });

  it("names a single month once, and adds nothing when the target starts with the forecast", () => {
    const march = forecastAnswerOf({ scope: { type: "total" }, target: { type: "month", month: 3 } });
    expect(march.sentence.startsWith("In Mar 2026, demand is forecast at 95 units. Over Jan–Mar 2026,")).toBe(true);
    const q1 = forecastAnswerOf({ scope: { type: "total" }, target: { type: "quarter", quarter: 1 } });
    expect(q1.targetDemand).toBeUndefined();
    expect(q1.sentence.startsWith("Over Jan–Mar 2026, demand is forecast at 285 units;")).toBe(true);
  });
});

describe("the answer for one category, warehouse, region or SKU (ticket 14)", () => {
  it("names the scope in the sentence", () => {
    expect(forecastAnswerOf(CRAYON).sentence).toBe(
      "Over Jan–Mar 2026, demand for category CRAYON is forecast at 11 units; with 44 units of safety stock, that is 55 units to plan for.",
    );
  });

  it("opens a SKU answer with why the SKU is not forecast, then gives its category's", () => {
    expect(forecastAnswerOf(CRAYON_0008).sentence).toBe(
      "CRAYON-0008 has 3 orders, too few to forecast on its own. Over Jan–Mar 2026, demand for its category, CRAYON, is forecast at 11 units; with 44 units of safety stock, that is 55 units to plan for.",
    );
  });

  it("requires a model sentence to name the scope, and for a SKU both the SKU and its category", () => {
    expect(requiredForecastWords(forecastAnswerOf(CRAYON))).toEqual(["CRAYON"]);
    expect(requiredForecastWords(forecastAnswerOf({ scope: { type: "region", value: "UK" } }))).toEqual(["UK", "rough"]);
    expect(requiredForecastWords(forecastAnswerOf(CRAYON_0008))).toEqual(["CRAYON-0008", "CRAYON"]);
  });

  it("answers an unknown SKU with its message", () => {
    expect(answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "sku", value: "CRAYON-9999" } }))).toEqual({
      kind: "no-data",
      message: "No SKU CRAYON-9999 in the data. SKU IDs are a category and a number, for example CRAYON-0008.",
    });
  });
});

describe("the forecast's facts block, which a model sentence is checked against", () => {
  it("holds the figures a sentence may use, formatted as the card shows them, in phrases rather than labels to copy", () => {
    expect(forecastFacts(forecastFor())).toEqual([
      "What is forecast: units ordered per month by order date, for all products, from orders 1 Jan–31 Dec 2025.",
      "The forecast covers Jan–Mar 2026 (3 months).",
      "Month by month, the forecast is Jan 2026 95.0, Feb 2026 95.0 and Mar 2026 95.0 units.",
      "The 95% range is Jan 2026 13.4–176.6, Feb 2026 0.0–210.5 and Mar 2026 0.0–236.4 units.",
      "Over Jan–Mar 2026, demand is forecast at 285 units.",
      "120 units of safety stock cover forecast error at a 95% service level.",
      "That makes 405 units to plan for. This is not a reorder quantity: the data has no stock on hand.",
      "On this series the 3-month moving average had the lowest error on Oct–Dec 2025: the forecast is the mean of the last 3 months, 95.0 units a month.",
      "Its error on Oct–Dec 2025 was 16.2 units a month on average, 17.1% of actual demand.",
      "The forecast is not rough.",
      "January 2025's spike is outside the 3-month window, so the forecast does not repeat it. One year of data cannot show whether January repeats.",
    ]);
  });

  it("adds the horizon notes, the reach and the scope note as they are", () => {
    expect(forecastFacts(forecastFor({ count: 6, unit: "week" }))).toContain("The forecast is monthly, so 6 weeks is shown as 2 months.");
    expect(forecastFacts(forecastAnswerOf({ scope: { type: "total" }, target: { type: "year", year: 2027 } }))[0]).toBe(
      "The forecast reaches Jun 2026 at most; 2027 is beyond it.",
    );
    expect(forecastFacts(forecastAnswerOf({ scope: { type: "region", value: "UK" } }))).toContain(
      "UK is served only by warehouse LON-FC1, so this forecast is the same as warehouse LON-FC1's.",
    );
  });

  it("gives a SKU's orders and why it is not forecast, ahead of its category's forecast", () => {
    const facts = forecastFacts(forecastAnswerOf(CRAYON_0008));
    expect(facts.slice(0, 2)).toEqual([
      "CRAYON-0008 has 3 orders in the data, too few to forecast on its own: no SKU has more than 3. The forecast is for its category, CRAYON, and is not split by SKU.",
      "Its orders: 14 Jan 2025 3 units, 22 Jan 2025 3 units and 18 Apr 2025 1 unit, 7 units in all.",
    ]);
    expect(facts).toContain("Over Jan–Mar 2026, demand for its category, CRAYON, is forecast at 11 units.");
  });
});
