import { describe, expect, it } from "vitest";
import { getDataset } from "./orders";
import { anchorDate, buckets, dataPeriod, formatDate, formatPeriod, noDataMessage, resolvePeriod } from "./periods";

const YEAR_2025 = { from: "2025-01-01", to: "2025-12-31" };

describe("resolvePeriod against the data, anchored on 31 Dec 2025 (ADR 0002 §3)", () => {
  it('resolves "last <unit>" to the full unit before the anchor\'s unit', () => {
    expect(resolvePeriod({ type: "previous", unit: "month" }, YEAR_2025)).toEqual({ from: "2025-11-01", to: "2025-11-30" });
    expect(resolvePeriod({ type: "previous", unit: "week" }, YEAR_2025)).toEqual({ from: "2025-12-22", to: "2025-12-28" });
    expect(resolvePeriod({ type: "previous", unit: "quarter" }, YEAR_2025)).toEqual({ from: "2025-07-01", to: "2025-09-30" });
    expect(resolvePeriod({ type: "previous", unit: "year" }, YEAR_2025)).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });

  it('resolves "last N <units>" to N units ending with the anchor\'s unit, and never past the anchor', () => {
    expect(resolvePeriod({ type: "last", count: 3, unit: "month" }, YEAR_2025)).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    // The anchor's week runs 29 Dec 2025 to 4 Jan 2026; the data stops on the 31st.
    expect(resolvePeriod({ type: "last", count: 2, unit: "week" }, YEAR_2025)).toEqual({ from: "2025-12-22", to: "2025-12-31" });
  });

  it('resolves "this <unit>" to the anchor\'s unit, up to the anchor', () => {
    expect(resolvePeriod({ type: "this", unit: "month" }, YEAR_2025)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod({ type: "this", unit: "week" }, YEAR_2025)).toEqual({ from: "2025-12-29", to: "2025-12-31" });
  });

  it('resolves "last N days" to N days ending on the anchor, inclusive', () => {
    expect(resolvePeriod({ type: "last_days", days: 7 }, YEAR_2025)).toEqual({ from: "2025-12-25", to: "2025-12-31" });
    expect(resolvePeriod({ type: "last_days", days: 1 }, YEAR_2025)).toEqual({ from: "2025-12-31", to: "2025-12-31" });
  });
});

describe("formatPeriod (ADR 0002 §3, §6)", () => {
  it('writes "1–30 Nov 2025", "1 Oct–31 Dec 2025", and a single day as one date', () => {
    expect(formatPeriod({ from: "2025-11-01", to: "2025-11-30" })).toBe("1–30 Nov 2025");
    expect(formatPeriod({ from: "2025-10-01", to: "2025-12-31" })).toBe("1 Oct–31 Dec 2025");
    expect(formatPeriod({ from: "2025-12-31", to: "2025-12-31" })).toBe("31 Dec 2025");
  });

  it("writes both years when the period crosses a year", () => {
    expect(formatPeriod({ from: "2024-12-30", to: "2025-01-05" })).toBe("30 Dec 2024–5 Jan 2025");
  });
});

describe("noDataMessage (ADR 0002 §6)", () => {
  it('says "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025." for a period outside the data', () => {
    expect(noDataMessage({ from: "2024-01-01", to: "2024-12-31" }, YEAR_2025)).toBe(
      "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025.",
    );
    expect(noDataMessage({ from: "2026-01-01", to: "2026-03-31" }, YEAR_2025)).toBe(
      "No data for 1 Jan–31 Mar 2026. The data covers 1 Jan–31 Dec 2025.",
    );
  });

  it("has nothing to say about a period that overlaps the data, even partly", () => {
    expect(noDataMessage({ from: "2025-12-15", to: "2026-01-15" }, YEAR_2025)).toBeNull();
    expect(noDataMessage(YEAR_2025, YEAR_2025)).toBeNull();
  });
});

describe("resolvePeriod for named and absolute periods (ADR 0002 §6)", () => {
  it('resolves a month or quarter without a year to its latest occurrence on or before the anchor: "March" = March 2025, "Q3" = Jul–Sep 2025', () => {
    expect(resolvePeriod({ type: "month", month: 3 }, YEAR_2025)).toEqual({ from: "2025-03-01", to: "2025-03-31" });
    expect(resolvePeriod({ type: "month", month: 12 }, YEAR_2025)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod({ type: "quarter", quarter: 3 }, YEAR_2025)).toEqual({ from: "2025-07-01", to: "2025-09-30" });
  });

  it("goes back a year for a month or quarter that has not come yet in the anchor's year", () => {
    const toFebruary = { from: "2024-01-01", to: "2025-02-14" };
    expect(resolvePeriod({ type: "month", month: 3 }, toFebruary)).toEqual({ from: "2024-03-01", to: "2024-03-31" });
    expect(resolvePeriod({ type: "quarter", quarter: 2 }, toFebruary)).toEqual({ from: "2024-04-01", to: "2024-06-30" });
  });

  it("keeps a named year, so February 2024 is February 2024 even with no data then", () => {
    expect(resolvePeriod({ type: "month", month: 2, year: 2024 }, YEAR_2025)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(resolvePeriod({ type: "quarter", quarter: 4, year: 2025 }, YEAR_2025)).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });

  it("takes an absolute range as written, and everything the data covers for all", () => {
    expect(resolvePeriod({ type: "range", from: "2025-03-10", to: "2025-04-02" }, YEAR_2025)).toEqual({ from: "2025-03-10", to: "2025-04-02" });
    expect(resolvePeriod({ type: "all" }, YEAR_2025)).toEqual(YEAR_2025);
  });
});

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
