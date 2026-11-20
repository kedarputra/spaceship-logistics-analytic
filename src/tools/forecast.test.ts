import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import {
  chooseMethod,
  type ForecastResult,
  forecastSeries,
  holdoutScores,
  januaryCaveat,
  oneStepSigma,
  predict,
  runForecast,
} from "./forecast";
import { months2025, ROUGH_SERIES } from "./forecast-fixtures";
import { type ForecastSpec, forecastSpecSchema } from "./spec";

// Units per month, Jan–Dec 2025 (docs/data.md).
const TOTAL = [233, 86, 148, 56, 115, 64, 126, 103, 94, 79, 113, 93];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function forecastTotal(horizon?: ForecastSpec["horizon"]): ForecastResult {
  const spec = forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" }, ...(horizon === undefined ? {} : { horizon }) });
  const result = runForecast(spec, getDataset());
  if (result.kind !== "forecast") throw new Error(result.message);
  return result;
}

const JANUARY_ENDING = "One year of data cannot show whether January repeats.";

describe("the four candidate methods (ADR 0003 §2)", () => {
  it("forecast a flat level: the all-history average, and the mean of the last 3 months", () => {
    expect(predict("average", [10, 20, 30], 2)).toEqual([20, 20]);
    expect(predict("moving_average", [5, 10, 20, 30], 2)).toEqual([20, 20]);
  });

  it("forecast a line fitted on the month index", () => {
    expect(predict("regression", [10, 20, 30], 2)).toEqual([40, 50]);
  });

  it("run Holt's trend with α 0.3, β 0.1, the first month as level and no trend at the start", () => {
    // From 233 with no trend, Holt stays well above 0 on the total, unlike a Jan→Feb starting trend.
    const [first] = predict("holt", TOTAL, 1);
    expect(first).toBeGreaterThan(0);
    expect(predict("holt", [10, 10, 10], 2)).toEqual([10, 10]);
  });
});

describe("choosing a method on the last 3 months (ADR 0003 §3, golden numbers)", () => {
  const scores = holdoutScores(TOTAL);

  it("scores each candidate by MAE: average 18.89, moving average 16.22, regression 35.21, Holt 25.24", () => {
    expect(scores.map(({ method, mae }) => [method, Number(mae.toFixed(2))])).toEqual([
      ["average", 18.89],
      ["moving_average", 16.22],
      ["regression", 35.21],
      ["holt", 25.24],
    ]);
  });

  it("reports WAPE with its numerator and denominator: the absolute error over the actual demand", () => {
    // The moving average of Jul–Sep is 107.67; Oct–Dec were 79, 113 and 93: errors 28.67 + 5.33 + 14.67.
    const movingAverage = scores.find(({ method }) => method === "moving_average");
    expect(movingAverage?.absoluteError).toBeCloseTo(48.67, 2);
    expect(movingAverage?.actualUnits).toBe(285);
    expect(movingAverage?.wape).toBeCloseTo(48.67 / 285, 3);
  });

  it("picks the 3-month moving average on the total", () => {
    expect(chooseMethod(scores)).toBe("moving_average");
  });

  it("gives a tie to the simpler method: average, then moving average, then regression, then Holt", () => {
    const tied = [
      { method: "holt" as const, mae: 5, wape: 0.1 },
      { method: "regression" as const, mae: 5, wape: 0.1 },
      { method: "moving_average" as const, mae: 7, wape: 0.1 },
    ];
    expect(chooseMethod(tied)).toBe("regression");
  });
});

describe("the error behind the safety stock (ADR 0003 §7)", () => {
  it("is 41.66 for the moving average: one-step errors from April 2025, each month predicted from earlier ones", () => {
    expect(oneStepSigma("moving_average", TOTAL)).toBeCloseTo(41.66, 2);
  });

  it("starts after the 3-month warm-up for every method: the average gives 42.9, not the 59.0 a February start would", () => {
    expect(oneStepSigma("average", TOTAL)).toBeCloseTo(42.9, 1);
  });
});

describe("the forecast of total demand (ADR 0003, golden numbers)", () => {
  const result = forecastTotal();

  it("reads monthly units by order date, Jan–Dec 2025", () => {
    expect(result.history.map((month) => month.units)).toEqual(TOTAL);
    expect(result.history.map((month) => month.label)).toEqual(MONTH_NAMES.map((name) => `${name} 2025`));
  });

  it("forecasts 3 months by default with the 3-month moving average refit on all 12 months: 95.0 a month", () => {
    expect(result.method.id).toBe("moving_average");
    expect(result.forecastMonths.map((month) => month.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    for (const month of result.forecastMonths) expect(month.units).toBeCloseTo(95.0, 6);
    expect(result.monthsLabel).toBe("Jan–Mar 2026");
  });

  it("lists every candidate's holdout MAE and WAPE on Oct–Dec 2025, labelled", () => {
    expect(result.holdout).toBe("Oct–Dec 2025");
    expect(result.candidates.map(({ label, mae }) => [label, Number(mae.toFixed(2))])).toEqual([
      ["All-history average", 18.89],
      ["3-month moving average", 16.22],
      ["Linear regression", 35.21],
      ["Holt's linear trend", 25.24],
    ]);
  });

  it("states the reason for this series, never as a global claim", () => {
    expect(result.method.reason).toBe(
      "On this series the 3-month moving average had the lowest error on Oct–Dec 2025: the forecast is the mean of the last 3 months, 95.0 units a month.",
    );
    expect(result.method.rough).toBe(false);
  });

  it("plans 405 units for 3 months: 285 forecast plus 120 safety stock, from σ 41.66", () => {
    expect(result.sigma).toBeCloseTo(41.66, 2);
    expect(result.sigmaFrom).toBe("Apr 2025");
    expect(result.recommendation).toEqual({ units: 405, demand: 285, safetyStock: 120 });
    // Before rounding: 285.0 + 1.65 × σ × √3 = 285.0 + 119.05 (σ 41.6563 unrounded), rounded up to 405.
    expect(result.exact.demand).toBeCloseTo(285, 6);
    expect(result.exact.safetyStock).toBeCloseTo(119.05, 2);
    expect(result.exact.total).toBeCloseTo(404.05, 2);
  });

  it("plans 518 units for 4 months: 380 forecast plus 138 safety stock", () => {
    expect(forecastTotal({ count: 4, unit: "month" }).recommendation).toEqual({ units: 518, demand: 380, safetyStock: 138 });
  });

  it("draws a 95% range of ±81.6, 115.5, 141.4 and 163.3 units at 1 to 4 months ahead, floored at 0", () => {
    const forecast = forecastTotal({ count: 4, unit: "month" }).forecastMonths;
    expect(forecast.map((month) => Number((month.high - month.units).toFixed(1)))).toEqual([81.6, 115.5, 141.4, 163.3]);
    // 95.0 − 81.6 is 13.4; from month 2 the lower bound would go below 0.
    expect(forecast.map((month) => Number(month.low.toFixed(1)))).toEqual([13.4, 0, 0, 0]);
  });

  it("adds the January caveat for the moving average, since the horizon includes January", () => {
    expect(result.januaryCaveat).toBe(`January 2025's spike is outside the 3-month window, so the forecast does not repeat it. ${JANUARY_ENDING}`);
  });

  it("is not available yet for a category, warehouse, region or SKU", () => {
    for (const scope of [
      { type: "category", value: "CRAYON" },
      { type: "warehouse", value: "LON-FC1" },
      { type: "region", value: "UK" },
      { type: "sku", value: "CRAYON-0008" },
    ]) {
      const spec = forecastSpecSchema.parse({ tool: "forecast", scope });
      expect(runForecast(spec, getDataset()).kind).toBe("unavailable");
    }
  });
});

describe("the horizon (ADR 0003 §6)", () => {
  it("allows 1 to 6 months, with a note beyond 3 that error was measured only up to 3 months ahead", () => {
    expect(forecastTotal({ count: 1, unit: "month" }).horizon).toEqual({ months: 1, notes: [] });
    const six = forecastTotal({ count: 6, unit: "month" });
    expect(six.forecastMonths).toHaveLength(6);
    expect(six.horizon.notes).toEqual(["The error was measured only up to 3 months ahead, so the months after Mar 2026 are less certain."]);
  });

  it("caps a longer request at 6 months, with a message", () => {
    const capped = forecastTotal({ count: 12, unit: "month" });
    expect(capped.forecastMonths).toHaveLength(6);
    expect(capped.horizon.notes[0]).toBe("Forecasts go up to 6 months ahead, so this shows 6 months instead of 12.");
  });

  it("turns weeks into whole months, with a note", () => {
    const sixWeeks = forecastTotal({ count: 6, unit: "week" });
    expect(sixWeeks.forecastMonths).toHaveLength(2);
    expect(sixWeeks.horizon.notes).toEqual(["The forecast is monthly, so 6 weeks is shown as 2 months."]);
    expect(forecastTotal({ count: 4, unit: "week" }).horizon).toEqual({
      months: 1,
      notes: ["The forecast is monthly, so 4 weeks is shown as 1 month."],
    });
  });
});

describe("the January caveat, worded for the winning method (ADR 0003 §5)", () => {
  const total = months2025(TOTAL);

  it("gives the level lift for the all-history average: +11 units a month on the total", () => {
    expect(januaryCaveat("average", total)).toBe(
      `January 2025's spike is averaged into the level (about +11 units a month) instead of being repeated in January 2026. ${JANUARY_ENDING}`,
    );
  });

  it("says the trend methods tilt downward and do not repeat the spike", () => {
    const tilted = `January 2025's spike tilts the fitted trend downward, and the forecast does not repeat it. ${JANUARY_ENDING}`;
    expect(januaryCaveat("regression", total)).toBe(tilted);
    expect(januaryCaveat("holt", total)).toBe(tilted);
  });

  it("is shown whenever the forecast months include January, and left out otherwise", () => {
    // History to Nov 2025: Dec 2025–Feb 2026. History to Sep 2025: Oct–Dec 2025.
    expect(forecastSeries(months2025(TOTAL).slice(0, 11)).januaryCaveat).toBeDefined();
    expect(forecastSeries(months2025(TOTAL).slice(0, 9)).januaryCaveat).toBeUndefined();
  });
});

describe("a rough forecast (ADR 0003 §4)", () => {
  it("is labelled rough when the winner's error is over 50% of actual demand", () => {
    // Every method predicts 10, so the tie goes to the average, WAPE 50 / 40.
    const result = forecastSeries(months2025(ROUGH_SERIES));
    expect(result.method.id).toBe("average");
    expect(result.candidates.find((candidate) => candidate.method === "average")?.wape).toBeCloseTo(1.25, 6);
    expect(result.method.rough).toBe(true);
    expect(result.method.reason).toMatch(/^On this series a flat level had the lowest error on Oct–Dec 2025/);
  });

  it("is labelled rough when the held-out months had no demand but the forecast missed, and not when it was right", () => {
    const missed = forecastSeries(months2025([10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 0, 0]));
    expect(missed.candidates[0]?.wape).toBeNull();
    expect(missed.method.rough).toBe(true);
    expect(forecastSeries(months2025([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).method.rough).toBe(false);
  });
});
