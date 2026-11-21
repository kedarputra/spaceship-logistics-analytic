import { describe, expect, it } from "vitest";
import { ratio } from "./definitions";
import { formatChange, formatCount, formatDays, formatDecimal, formatFraction, formatMetricValue, formatOf, formatPercent, formatPercentPlain } from "./format";

// Display precision from ADR 0001 §7: rates and days to 1 decimal; computation keeps full precision.
describe("display formatting (ADR 0001)", () => {
  it("shows a rate as a percentage with 1 decimal", () => {
    expect(formatPercent(ratio(304, 370).value)).toBe("82.2%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("shows a rate's numerator and denominator", () => {
    expect(formatFraction(ratio(304, 370))).toBe("304 / 370");
  });

  it("rounds an exact half up, however the division lands in floating point: 29 of 400 is 7.25%, shown 7.3% (ticket 25)", () => {
    expect(formatPercent(ratio(29, 400).value)).toBe("7.3%");
    expect(formatPercent(ratio(9, 400).value)).toBe("2.3%");
    expect(formatPercent(ratio(11, 47).value)).toBe("23.4%");
    expect(formatMetricValue(29 / 400, "percent", 2)).toBe("7.25%");
    expect(formatDays(1.45)).toBe("1.5 days");
    // Every formatter rounds the same way, so one figure never reads two ways on a page.
    expect(formatDecimal(1.45)).toBe("1.5");
    expect(formatDecimal(2.5, 0)).toBe("3");
    expect(formatDecimal(1234.565, 2)).toBe("1,234.57");
    expect(formatDecimal((29 / 400) * 100)).toBe("7.3");
    expect(formatDecimal(1.005, 2)).toBe("1.01");
  });

  it("writes a threshold or an axis tick as a percentage without a trailing .0: 0.5 → 50%, 29 of 400 → 7.3%", () => {
    expect(formatPercentPlain(0.5)).toBe("50%");
    expect(formatPercentPlain(0.6)).toBe("60%");
    expect(formatPercentPlain(29 / 400)).toBe("7.3%");
  });

  it("writes a rate's parts in words, 304 of 370, and units to the whole unit for a plan (ticket 25)", () => {
    expect(formatOf(ratio(1304, 3700))).toBe("1,304 of 3,700");
    expect(formatDecimal(176.6, 0)).toBe("177");
    expect(formatDecimal(13.4, 0)).toBe("13");
  });

  it("shows days with 1 decimal", () => {
    expect(formatDays(3.83)).toBe("3.8 days");
    expect(formatDays(2)).toBe("2.0 days");
  });

  it("shows counts as whole numbers with a thousands separator", () => {
    expect(formatCount(400)).toBe("400");
    expect(formatCount(1310)).toBe("1,310");
  });

  it("formats a metric value by its unit: 1 decimal on screen, 2 in the explanation table", () => {
    expect(formatMetricValue(304 / 370, "percent")).toBe("82.2%");
    expect(formatMetricValue(304 / 370, "percent", 2)).toBe("82.16%");
    expect(formatMetricValue(3.8297, "days")).toBe("3.8 days");
    expect(formatMetricValue(3.8297, "days", 2)).toBe("3.83 days");
    expect(formatMetricValue(1310, "units")).toBe("1,310");
    expect(formatMetricValue(55, "orders", 2)).toBe("55");
    expect(formatMetricValue(13695.87, "USD")).toBe("USD 13,695.87");
    expect(formatMetricValue(null, "percent")).toBe("n/a");
  });

  it('shows "n/a" for a value that a zero denominator left undefined', () => {
    expect(formatPercent(null)).toBe("n/a");
    expect(formatDays(null)).toBe("n/a");
    expect(formatFraction(ratio(0, 0))).toBe("0 / 0");
  });
});

describe("a change against the month before (ticket 34)", () => {
  it("signs it, a minus sign for a fall, in the figure's own unit: rates in points, days and money as shown elsewhere", () => {
    expect(formatChange(2.3923, "points")).toBe("+2.4 points");
    expect(formatChange(0.4049, "points")).toBe("+0.4 points");
    expect(formatChange(-2, "orders")).toBe("−2");
    expect(formatChange(34, "units")).toBe("+34");
    expect(formatChange(1234, "units")).toBe("+1,234");
    expect(formatChange(688.96, "USD")).toBe("+$688.96");
    expect(formatChange(-480.66, "USD")).toBe("−$480.66");
    expect(formatChange(0.4187, "days")).toBe("+0.4 days");
  });

  it("rounds an exact half away from zero either way, and shows no sign where it rounds to nothing", () => {
    expect(formatChange(0.25, "points")).toBe("+0.3 points");
    expect(formatChange(-0.25, "points")).toBe("−0.3 points");
    expect(formatChange(-0.04, "points")).toBe("0.0 points");
    expect(formatChange(0, "orders")).toBe("0");
  });

  it('is "n/a" with nothing to compare', () => {
    expect(formatChange(null, "points")).toBe("n/a");
  });
});
