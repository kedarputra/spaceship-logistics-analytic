import { describe, expect, it } from "vitest";
import { orderCountOverTime } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import { dataPeriod } from "@/domain/periods";
import { extremeIndexes, niceScale } from "./scale";

describe("which bars carry a value label (ticket 24)", () => {
  it("labels only the highest and lowest months of orders: Jan 75 and Sep 18", () => {
    const { orders } = getDataset();
    const months = orderCountOverTime(orders, dataPeriod(orders), "month");
    const labelled = [...extremeIndexes(months.map(({ value }) => value))].map((index) => {
      const month = months[index];
      return month === undefined ? "" : `${month.bucket.label} ${month.value}`;
    });
    expect(labelled.sort()).toEqual(["Jan 2025 75", "Sep 2025 18"]);
  });

  it("labels every bar tied at an extreme, and nothing for no bars", () => {
    expect([...extremeIndexes([3, 1, 3, 1, 2])].sort()).toEqual([0, 1, 2, 3]);
    expect(extremeIndexes([])).toEqual(new Set());
  });
});

describe("the value axis", () => {
  it("rounds the top up to a round step: 75 orders → 0 to 80 in steps of 20, a 25% rate → 30%", () => {
    expect(niceScale(75)).toEqual({ max: 80, ticks: [0, 20, 40, 60, 80] });
    expect(niceScale(0.25).max).toBeCloseTo(0.3, 10);
  });
});
