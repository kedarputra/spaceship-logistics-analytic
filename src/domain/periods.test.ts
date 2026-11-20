import { describe, expect, it } from "vitest";
import { getDataset } from "./orders";
import { anchorDate, buckets, dataPeriod, formatDate } from "./periods";

const YEAR_2025 = { from: "2025-01-01", to: "2025-12-31" };

describe("month buckets (ADR 0002 §4)", () => {
  it("splits a period into calendar months, keyed by the 1st and clipped to the period", () => {
    expect(buckets({ from: "2025-11-15", to: "2025-12-31" }, "month")).toEqual([
      { key: "2025-11-01", label: "Nov 2025", from: "2025-11-15", to: "2025-11-30", partial: true },
      { key: "2025-12-01", label: "Dec 2025", from: "2025-12-01", to: "2025-12-31", partial: false },
    ]);
  });

  it("gives 2025 as twelve whole months, February with 28 days", () => {
    const months = buckets(YEAR_2025, "month");
    expect(months.map((month) => month.label)).toEqual([
      "Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025", "Jun 2025",
      "Jul 2025", "Aug 2025", "Sep 2025", "Oct 2025", "Nov 2025", "Dec 2025",
    ]);
    expect(months.some((month) => month.partial)).toBe(false);
    expect(months[1]).toMatchObject({ from: "2025-02-01", to: "2025-02-28" });
  });
});

describe("week buckets (ADR 0002 §4)", () => {
  it("keys the ISO week of 1–5 Jan 2025 by its Monday, 30 Dec 2024, and clips it to the period", () => {
    expect(buckets(YEAR_2025, "week")[0]).toEqual({
      key: "2024-12-30",
      label: "w/c 30 Dec",
      from: "2025-01-01",
      to: "2025-01-05",
      partial: true,
    });
  });

  it("keys 29–31 Dec 2025 by Monday 29 Dec 2025 as its own bucket, not merged with the first week", () => {
    const weeks = buckets(YEAR_2025, "week");
    expect(weeks.at(-1)).toEqual({
      key: "2025-12-29",
      label: "w/c 29 Dec",
      from: "2025-12-29",
      to: "2025-12-31",
      partial: true,
    });
    // Mondays from 30 Dec 2024 to 29 Dec 2025, 364 days apart: 53 distinct weeks.
    expect(weeks).toHaveLength(53);
    expect(new Set(weeks.map((week) => week.key)).size).toBe(53);
  });
});

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

describe("dataPeriod (ADR 0002 §6)", () => {
  it("covers 1 Jan–31 Dec 2025: the first order_date to the anchor date", () => {
    expect(dataPeriod(getDataset().orders)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
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
