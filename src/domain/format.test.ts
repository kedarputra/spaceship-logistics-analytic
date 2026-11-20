import { describe, expect, it } from "vitest";
import { ratio } from "./definitions";
import { formatCount, formatDays, formatFraction, formatPercent } from "./format";

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

  it("shows days with 1 decimal", () => {
    expect(formatDays(3.83)).toBe("3.8 days");
    expect(formatDays(2)).toBe("2.0 days");
  });

  it("shows counts as whole numbers with a thousands separator", () => {
    expect(formatCount(400)).toBe("400");
    expect(formatCount(1310)).toBe("1,310");
  });

  it('shows "n/a" for a value that a zero denominator left undefined', () => {
    expect(formatPercent(null)).toBe("n/a");
    expect(formatDays(null)).toBe("n/a");
    expect(formatFraction(ratio(0, 0))).toBe("0 / 0");
  });
});
