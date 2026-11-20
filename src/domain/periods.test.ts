import { describe, expect, it } from "vitest";
import { anchorDate, formatDate } from "./periods";

describe("anchorDate (ADR 0002)", () => {
  it("is the latest delivery_date when the last thing that happened was a delivery", () => {
    const orders = [
      { order_date: "2024-12-30", delivery_date: "2025-01-02" },
      { order_date: "2024-12-31", delivery_date: null },
    ];
    expect(anchorDate(orders)).toBe("2025-01-02");
  });

  it("is the latest order_date when an order placed after the last delivery is still open", () => {
    const orders = [
      { order_date: "2025-03-01", delivery_date: "2025-03-05" },
      { order_date: "2025-03-07", delivery_date: null },
    ];
    expect(anchorDate(orders)).toBe("2025-03-07");
  });

  it("refuses an empty dataset", () => {
    expect(() => anchorDate([])).toThrow(/no orders/i);
  });
});

describe("formatDate", () => {
  it('writes 2025-12-31 as "31 Dec 2025"', () => {
    expect(formatDate("2025-12-31")).toBe("31 Dec 2025");
  });

  it("writes the day without a leading zero", () => {
    expect(formatDate("2025-01-05")).toBe("5 Jan 2025");
  });

  it("rejects a value that is not a YYYY-MM-DD date", () => {
    expect(() => formatDate("31/12/2025")).toThrow();
    expect(() => formatDate("2025-13-01")).toThrow();
  });
});
