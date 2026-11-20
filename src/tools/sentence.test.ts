import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { type Answer, presentAnswer } from "./answer";
import { runQuery } from "./query";
import { factsFor, templateSentence } from "./sentence";
import { querySpecSchema } from "./spec";

function answerFor(spec: Record<string, unknown>): Answer {
  const result = runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
  if (result.kind !== "result") throw new Error(result.message);
  return presentAnswer(result);
}

describe("template sentences, one per kind of result (ADR 0009 §4)", () => {
  it("states a single value with its period and date field", () => {
    expect(templateSentence(answerFor({ metric: "delayed_orders", period: { type: "previous", unit: "month" } }))).toBe(
      "Delayed orders: 3 in 1–30 Nov 2025, by delivery date.",
    );
    expect(templateSentence(answerFor({ metric: "on_time_rate" }))).toBe(
      "On-time delivery rate: 82.2% (304 of 370) in 1 Jan–31 Dec 2025, by delivery date.",
    );
    expect(templateSentence(answerFor({ metric: "average_delivery_time" }))).toBe(
      "Average delivery time: 3.8 days over 370 deliveries in 1 Jan–31 Dec 2025, by delivery date.",
    );
  });

  it("names the small-sample top and the top with at least 20 deliveries, even when the limit keeps only the first (ADR 0001 §6)", () => {
    expect(templateSentence(answerFor({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 }))).toBe(
      "Highest delay rate: GLS 25.0% (2 of 8) on only 8 deliveries; among carriers with at least 20, USPS 23.4% (11 of 47).",
    );
  });

  it("names a reliable top outright", () => {
    expect(templateSentence(answerFor({ metric: "delay_rate", groupBy: "carrier", minDelivered: 20 }))).toBe(
      "Highest delay rate: USPS 23.4% (11 of 47).",
    );
  });

  it("says when no group has enough deliveries for a reliable ranking", () => {
    const sentence = templateSentence(answerFor({ metric: "delay_rate", groupBy: "destination" }));
    expect(sentence).toMatch(/^No destination city has at least 20 deliveries, so no ranking is reliable; the highest is .+ on only \d+ deliveries\.$/);
  });

  it("names every group tied at the top", () => {
    expect(templateSentence(answerFor({ metric: "order_count", groupBy: "destination", sort: "desc", limit: 1 }))).toBe(
      "Most orders: Boston, MA and Leeds, UK, with 15 each.",
    );
  });

  it("sums a count over time and names its peak weeks", () => {
    expect(
      templateSentence(answerFor({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } })),
    ).toBe("Delayed orders by week, 1 Oct–31 Dec 2025, by delivery date: 10 in all; the most in w/c 6 Oct, w/c 17 Nov and w/c 15 Dec (2 each).");
  });

  it("gives the highest and lowest point of a rate over time", () => {
    expect(templateSentence(answerFor({ metric: "on_time_rate", groupBy: "month" }))).toMatch(
      /^On-time delivery rate by month, 1 Jan–31 Dec 2025, by delivery date: highest in .+ \(\d+\.\d%\), lowest in .+ \(\d+\.\d%\)(, among months with at least 20 deliveries)?\.$/,
    );
  });

  it("gives no total when a limit cut the rows, since the rows kept are not the whole", () => {
    const tie = answerFor({ metric: "order_count", groupBy: "destination", sort: "desc", limit: 1 });
    expect(factsFor(tie).join("\n")).not.toContain("Total");
    const topWeeks = answerFor({ metric: "delayed_orders", groupBy: "week", sort: "desc", limit: 3 });
    expect(templateSentence(topWeeks)).not.toContain("in all");
    expect(factsFor(topWeeks).join("\n")).not.toContain("Total");
  });

  it("names the extremes of a rate over time among the points with at least 20 deliveries only", () => {
    const answer = answerFor({ metric: "on_time_rate", groupBy: "month" });
    const smallMonths = answer.rows.filter((row) => row.smallSample).map((row) => row.label);
    expect(smallMonths.length).toBeGreaterThan(0);
    const sentence = templateSentence(answer);
    expect(sentence).toMatch(/, among months with at least 20 deliveries\.$/);
    for (const month of smallMonths) expect(sentence).not.toContain(month);
  });

  it("says when no point of a rate over time has enough deliveries", () => {
    expect(templateSentence(answerFor({ metric: "on_time_rate", groupBy: "week", period: { type: "previous", unit: "month" } }))).toMatch(
      /: no week has at least 20 deliveries, so no week stands out reliably\.$/,
    );
  });

  it("says a small-sample average once: over only N deliveries", () => {
    const sentence = templateSentence(answerFor({ metric: "average_delivery_time", groupBy: "carrier", sort: "desc", limit: 1 }));
    expect(sentence).toMatch(/^Highest average delivery time: \S+ \d+\.\d days over only \d+ deliveries; among carriers with at least 20, /);
    expect(sentence).not.toContain("on only");
  });

  it("totals the delivery outcomes over time", () => {
    expect(templateSentence(answerFor({ metric: "delivery_outcomes", groupBy: "month" }))).toBe(
      "Delivery outcomes by month, 1 Jan–31 Dec 2025, by delivery date: 370 delivered, 304 on time, 55 delayed and 11 exception.",
    );
  });

  it("is what /api/run answers with: every answer carries its template sentence", () => {
    const answer = answerFor({ metric: "delayed_orders", period: { type: "previous", unit: "month" } });
    expect(answer.sentence).toBe("Delayed orders: 3 in 1–30 Nov 2025, by delivery date.");
    expect(answer.sentenceSource).toBe("template");
  });
});

describe("the facts block (ADR 0009 §4)", () => {
  const facts = factsFor(answerFor({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 })).join("\n");

  it("holds the period with its dates, the values with numerators and denominators, and the threshold", () => {
    expect(facts).toContain("1 Jan–31 Dec 2025, by delivery date");
    expect(facts).toContain("GLS: 25.0% (2 of 8), a small sample");
    expect(facts).toContain("USPS: 23.4% (11 of 47)");
    expect(facts).toContain("at least 20 delivered orders");
  });
});
