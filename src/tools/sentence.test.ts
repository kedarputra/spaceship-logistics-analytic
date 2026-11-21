import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { type Answer, presentAnswer } from "./answer";
import { runQuery } from "./query";
import { factsFor, templateSentence } from "./sentence";
import { querySpecSchema } from "./spec";

function answerFor(spec: Record<string, unknown>): Answer {
  const result = runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
  if (result.kind !== "result") throw new Error(result.message);
  return presentAnswer(result, getDataset().orders);
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
      /^On-time delivery rate by month, 1 Jan–31 Dec 2025, by delivery date: .+ overall; highest in .+ \(\d+\.\d%\), lowest in .+ \(\d+\.\d%\)(, among months with at least 20 deliveries)?\.$/,
    );
  });

  it("gives the period's real total even when a limit cut the rows: 400 orders, 55 delayed in 2025", () => {
    const tie = answerFor({ metric: "order_count", groupBy: "destination", sort: "desc", limit: 1 });
    expect(factsFor(tie)).toContain("Total: 400");
    const topWeeks = answerFor({ metric: "delayed_orders", groupBy: "week", sort: "desc", limit: 3 });
    expect(templateSentence(topWeeks)).toContain(": 55 in all;");
    expect(factsFor(topWeeks)).toContain("Total: 55");
  });

  it("states the order of a ranking, so the first group is described the right way round", () => {
    expect(factsFor(answerFor({ metric: "average_delivery_time", groupBy: "region", sort: "asc", limit: 1 }))).toContain(
      "Order: lowest first",
    );
    expect(factsFor(answerFor({ metric: "delay_rate", groupBy: "carrier" }))).toContain("Order: highest first");
    expect(factsFor(answerFor({ metric: "order_count", groupBy: "month" })).some((fact) => fact.startsWith("Order:"))).toBe(false);
  });

  it("gives a rate over time its overall figure: 82.2% (304 of 370)", () => {
    const answer = answerFor({ metric: "on_time_rate", groupBy: "month" });
    expect(factsFor(answer)).toContain("Overall: 82.2% (304 of 370)");
    expect(templateSentence(answer)).toMatch(/^On-time delivery rate by month, 1 Jan–31 Dec 2025, by delivery date: 82\.2% \(304 of 370\) overall; highest in /);
  });

  it("puts a series' extremes in the facts, computed by code from the points with at least 20 deliveries", () => {
    const facts = factsFor(answerFor({ metric: "on_time_rate", groupBy: "month" }));
    expect(facts).toContain("Highest month with at least 20 deliveries: Apr 2025 (89.3%)");
    expect(facts).toContain("Lowest month with at least 20 deliveries: May 2025 (72.7%)");
    expect(factsFor(answerFor({ metric: "order_count", groupBy: "month" }))).toContain("Most: Jan 2025 (75)");
  });

  it("gives a share no small-sample wording, and no overall share of all orders by all orders", () => {
    const facts = factsFor(answerFor({ metric: "order_share", groupBy: "carrier" })).join("\n");
    expect(facts).not.toContain("Small-sample");
    expect(facts).not.toContain("Overall");
    expect(facts).not.toContain("Top with at least");
  });

  it("writes a status filter as the UI does: In transit; promo stays yes", () => {
    const facts = factsFor(answerFor({ metric: "order_count", filters: { status: ["in_transit"], promo: ["yes"] } })).join("\n");
    expect(facts).toContain("Filters: status is In transit; promo is yes");
  });

  it("states a share with its count and the whole: 5.5% (22 of 400)", () => {
    expect(templateSentence(answerFor({ metric: "order_share", filters: { promo: ["yes"] } }))).toBe(
      "Share of orders: 5.5% (22 of 400) in 1 Jan–31 Dec 2025, by order date.",
    );
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
      / overall; no week has at least 20 deliveries, so no week stands out reliably\.$/,
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
