import { describe, expect, it } from "vitest";
import { chartReason, chooseChart, FORECAST_CHART_REASON } from "./chart";

describe("chooseChart (ADR 0006 §6)", () => {
  it("shows a single value, with no dimension, as an answer card", () => {
    expect(chooseChart({ dimension: "none", measure: "count" })).toBe("answer-card");
    expect(chooseChart({ dimension: "none", measure: "rate" })).toBe("answer-card");
  });

  it("shows a count over time as vertical bars", () => {
    expect(chooseChart({ dimension: "time", measure: "count" })).toBe("vertical-bars");
  });

  it("shows a rate or an average over time as a line", () => {
    expect(chooseChart({ dimension: "time", measure: "rate" })).toBe("line");
    expect(chooseChart({ dimension: "time", measure: "average" })).toBe("line");
  });

  it("shows one category as horizontal bars, whatever the measure", () => {
    expect(chooseChart({ dimension: "category", measure: "rate" })).toBe("horizontal-bars");
    expect(chooseChart({ dimension: "category", measure: "count" })).toBe("horizontal-bars");
  });

  it("shows the shares of a whole as a stacked bar: delivery outcomes over time, or a status breakdown", () => {
    expect(chooseChart({ dimension: "time", measure: "count", shareOfWhole: true })).toBe("stacked-bars");
    expect(chooseChart({ dimension: "category", measure: "count", shareOfWhole: true })).toBe("stacked-bars");
  });
});

describe("why this chart (B5, ADR 0008 §4): one sentence from the same rules", () => {
  it("says what the result is and which chart that makes", () => {
    expect(chartReason({ dimension: "time", measure: "count" })).toBe("Time + count → vertical bars: each period's count stands on its own.");
    expect(chartReason({ dimension: "time", measure: "rate" })).toBe(
      "Time + rate → a line, so the trend shows; a rate is not added up across periods.",
    );
    expect(chartReason({ dimension: "time", measure: "average" })).toBe(
      "Time + average → a line, so the trend shows; an average is not added up across periods.",
    );
    expect(chartReason({ dimension: "category", measure: "rate" })).toBe(
      "Category + rate → horizontal bars, ranked, so the names stay readable.",
    );
    expect(chartReason({ dimension: "time", measure: "count", shareOfWhole: true })).toBe(
      "Parts of one whole → stacked bars, so the parts add up to the total.",
    );
    expect(chartReason({ dimension: "none", measure: "rate" })).toBe("One value → the number itself: a chart of one point adds nothing.");
  });

  it("explains the forecast chart too", () => {
    expect(FORECAST_CHART_REASON).toBe(
      "History + forecast → a line, the forecast dashed with its 95% range shaded, so it reads as an estimate (ADR 0003 §8).",
    );
  });
});
