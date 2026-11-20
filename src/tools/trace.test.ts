import { describe, expect, it } from "vitest";
import { answerQuery } from "./answer";
import { answerForecast } from "./forecast-answer";
import { forecastSpecSchema, querySpecSchema } from "./spec";
import { toolStages } from "./trace";

function query(fields: Record<string, unknown>) {
  const answer = answerQuery(querySpecSchema.parse({ tool: "query", ...fields }));
  if (answer.kind !== "result") throw new Error(answer.message);
  return answer;
}

function forecast(fields: Record<string, unknown>) {
  const answer = answerForecast(forecastSpecSchema.parse({ tool: "forecast", ...fields }));
  if (answer.kind !== "forecast") throw new Error(answer.message);
  return answer;
}

describe("the stages of the pipeline trace that the tools account for (B5, ADR 0008 §4)", () => {
  it("names the tool selected, times the computation, and sizes the result: one value, a series, a ranking cut by a limit", () => {
    const late = toolStages(query({ metric: "delayed_orders", period: { type: "previous", unit: "month" } }), 2);
    expect(late.tool).toEqual({ stage: "tool", detail: "query tool: delayed orders" });
    expect(late.computation).toEqual({ stage: "computation", detail: "computed in code", ms: 2 });
    expect(late.result).toEqual({ stage: "result", detail: "1 value" });
    expect(toolStages(query({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } }), 1).result.detail).toBe(
      "14 weeks",
    );
    expect(toolStages(query({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 }), 1).result.detail).toBe("1 of 9 carriers shown");
  });

  it("flags a status rewrite in the computation (ADR 0006 §2)", () => {
    expect(toolStages(query({ metric: "order_count", filters: { status: ["delayed"] } }), 3).computation).toEqual({
      stage: "computation",
      detail: "status rewrite: order count with status delayed → delayed orders",
      ms: 3,
      flagged: true,
    });
  });

  it("names the chart, and the rows the chart leaves to the table", () => {
    expect(toolStages(query({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } }), 1).chart).toEqual({
      stage: "chart",
      detail: "vertical bars",
    });
    expect(toolStages(query({ metric: "order_count", groupBy: "destination" }), 1).chart.detail).toBe("horizontal bars, 35 more in the table");
    expect(toolStages(query({ metric: "on_time_rate" }), 1).chart.detail).toBe("answer card");
  });

  it("describes a forecast: its scope, the method chosen, the months, a rough forecast flagged", () => {
    const total = toolStages(forecast({ scope: { type: "total" } }), 4);
    expect(total.tool).toEqual({ stage: "tool", detail: "forecast tool: all products" });
    expect(total.computation).toEqual({ stage: "computation", detail: "3-month moving average chosen on Oct–Dec 2025", ms: 4 });
    expect(total.result).toEqual({ stage: "result", detail: "3 months forecast" });
    expect(total.chart).toEqual({ stage: "chart", detail: "history and forecast line" });
    expect(toolStages(forecast({ scope: { type: "region", value: "UK" } }), 4).result).toEqual({
      stage: "result",
      detail: "3 months forecast, rough",
      flagged: true,
    });
  });
});
