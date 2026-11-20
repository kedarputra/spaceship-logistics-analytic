import { describe, expect, it } from "vitest";
import { chooseChart } from "./chart";

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
