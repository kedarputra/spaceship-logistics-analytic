import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { type Answer, presentAnswer } from "./answer";
import { runQuery } from "./query";
import { querySpecSchema } from "./spec";

function answerFor(spec: Record<string, unknown>): Answer {
  const result = runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
  if (result.kind !== "result") throw new Error(result.message);
  return presentAnswer(result);
}

const LATE_LAST_MONTH = { metric: "delayed_orders", period: { type: "previous", unit: "month" } };
const DELAYED_BY_WEEK = { metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } };
const HIGHEST_DELAY_RATE = { metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 };

describe("the interpretation, written by code from the spec (ADR 0006 §7)", () => {
  it("states the metric, the resolved period and the date field", () => {
    expect(answerFor(LATE_LAST_MONTH).interpretation).toBe("Delayed orders, 1–30 Nov 2025 by delivery date.");
    expect(answerFor(DELAYED_BY_WEEK).interpretation).toBe("Delayed orders by week, 1 Oct–31 Dec 2025 by delivery date.");
  });

  it("states the order and the limit of a ranking", () => {
    expect(answerFor(HIGHEST_DELAY_RATE).interpretation).toBe(
      "Delay rate by carrier, highest first, top 1, 1 Jan–31 Dec 2025 by delivery date.",
    );
  });

  it("states the filters with their values as they are in the data, and a minimum of deliveries", () => {
    expect(answerFor({ metric: "order_count", filters: { carrier: ["ups", "fedex"], region: ["US-E"] } }).interpretation).toBe(
      "Orders, 1 Jan–31 Dec 2025 by order date, where carrier is UPS or FedEx and region is US-E.",
    );
    expect(answerFor({ metric: "delay_rate", groupBy: "carrier", minDelivered: 20 }).interpretation).toBe(
      "Delay rate by carrier, highest first, 1 Jan–31 Dec 2025 by delivery date, only groups with at least 20 delivered orders.",
    );
  });
});

describe("the default an ambiguous word was read with, stated by code (ADR 0006 §8)", () => {
  it('says how "best", "performance" and "late" were read, and nothing when no default was applied', () => {
    expect(answerFor({ metric: "on_time_rate", groupBy: "carrier", assumption: "best" }).assumptionNote).toBe(
      '"Best" is read as the highest on-time delivery rate.',
    );
    expect(answerFor({ metric: "on_time_rate", assumption: "performance" }).assumptionNote).toBe(
      '"Performance" is read as the on-time delivery rate.',
    );
    expect(answerFor({ ...LATE_LAST_MONTH, assumption: "late" }).assumptionNote).toBe(
      '"Late" is read as delayed orders; exception orders are counted separately.',
    );
    expect(answerFor(LATE_LAST_MONTH).assumptionNote).toBeUndefined();
  });

  it('states the direction the ranking was actually sorted in, so "least reliable" never reads as "best"', () => {
    const worst = { metric: "on_time_rate", groupBy: "carrier", sort: "asc", limit: 1, assumption: "best" } as const;
    expect(answerFor(worst).assumptionNote).toBe("The worst is read as the lowest on-time delivery rate.");
    expect(answerFor({ ...worst, sort: "desc" }).assumptionNote).toBe('"Best" is read as the highest on-time delivery rate.');
  });
});

describe("the chart, chosen by code (ADR 0006 §6)", () => {
  it("shows a single value as an answer card, a count over time as bars, a rate over time as a line", () => {
    expect(answerFor(LATE_LAST_MONTH).chart.type).toBe("answer-card");
    expect(answerFor(DELAYED_BY_WEEK).chart.type).toBe("vertical-bars");
    expect(answerFor({ metric: "delay_rate", groupBy: "month" }).chart.type).toBe("line");
  });

  it("shows a category as horizontal bars, at most 12, with the rest left to the table", () => {
    expect(answerFor(HIGHEST_DELAY_RATE).chart).toEqual({
      type: "horizontal-bars",
      hiddenRows: 0,
      reason: "Category + rate → horizontal bars, ranked, so the names stay readable.",
    });
    const destinations = answerFor({ metric: "order_count", groupBy: "destination" });
    expect(destinations.chart).toMatchObject({ type: "horizontal-bars", hiddenRows: destinations.rows.length - 12 });
    expect(destinations.rows.length).toBe(47);
  });

  it("shows shares of a whole as a stacked bar: delivery outcomes over time, and a status breakdown", () => {
    expect(answerFor({ metric: "delivery_outcomes", groupBy: "month" }).chart.type).toBe("stacked-bars");
    expect(answerFor({ metric: "order_count", groupBy: "status" }).chart.type).toBe("stacked-bars");
  });
});

describe("follow-up chips, built by code", () => {
  it('offers "December 2025 instead?" on a last-month answer, running the anchor\'s month (ADR 0002 §3)', () => {
    const chip = answerFor(LATE_LAST_MONTH).followUps.find((followUp) => followUp.label === "December 2025 instead?");
    expect(chip?.spec).toEqual({ tool: "query", metric: "delayed_orders", period: { type: "this", unit: "month" } });
  });

  it('offers "Only carriers with ≥ 20 deliveries" when the top carrier is a small sample', () => {
    const chip = answerFor(HIGHEST_DELAY_RATE).followUps.find((followUp) => followUp.label === "Only carriers with ≥ 20 deliveries");
    expect(chip?.spec).toMatchObject({ metric: "delay_rate", groupBy: "carrier", minDelivered: 20 });
  });

  it("offers no such chip when no group reaches 20, nor when the top group is reliable", () => {
    const labels = (spec: Record<string, unknown>) => answerFor(spec).followUps.map((followUp) => followUp.label);
    expect(labels({ metric: "delay_rate", groupBy: "destination" }).some((label) => label.includes("≥ 20"))).toBe(false);
    expect(labels({ metric: "delay_rate", groupBy: "region" }).some((label) => label.includes("≥ 20"))).toBe(false);
  });

  it('offers the alternatives when an ambiguous default was applied (ADR 0006 §8): "best", "performance", "late"', () => {
    const best = answerFor({ metric: "on_time_rate", groupBy: "carrier", assumption: "best" }).followUps;
    expect(best.map((followUp) => followUp.label)).toEqual(["Delay rate instead?", "Average delivery time instead?"]);
    expect(best[0]?.spec).toMatchObject({ metric: "delay_rate", groupBy: "carrier", sort: "asc" });
    expect(best[0]?.spec.assumption).toBeUndefined();
    const late = answerFor({ ...LATE_LAST_MONTH, assumption: "late" }).followUps.find(
      (followUp) => followUp.label === "Count exception orders too?",
    );
    expect(late?.spec).toMatchObject({ metric: "order_count", filters: { status: ["delayed", "exception"] } });
  });

  it("offers no alternatives when the question named its metric", () => {
    const labels = (spec: Record<string, unknown>) => answerFor(spec).followUps.map((followUp) => followUp.label);
    expect(labels({ metric: "on_time_rate", groupBy: "carrier" })).toEqual([]);
    expect(labels(LATE_LAST_MONTH)).toEqual(["December 2025 instead?"]);
  });

  it("turns a ranking around for another metric, but keeps time in calendar order", () => {
    const byMonth = answerFor({ metric: "on_time_rate", groupBy: "month", assumption: "performance" }).followUps;
    expect(byMonth.map((followUp) => followUp.spec.sort)).toEqual([undefined, undefined]);
  });

  it("builds only specs the whitelist accepts", () => {
    const answers = [
      { ...LATE_LAST_MONTH, assumption: "late" },
      { ...DELAYED_BY_WEEK, assumption: "late" },
      HIGHEST_DELAY_RATE,
      { metric: "on_time_rate", groupBy: "carrier", assumption: "best" },
    ].map(answerFor);
    const specs = answers.flatMap((answer) => answer.followUps.map((followUp) => followUp.spec));
    expect(specs.length).toBeGreaterThanOrEqual(6);
    for (const spec of specs) expect(querySpecSchema.safeParse(spec).success).toBe(true);
  });
});
