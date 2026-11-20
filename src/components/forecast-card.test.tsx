import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { answerForecast, type ForecastAnswer, presentForecast } from "@/tools/forecast-answer";
import { forecastResultFor, ROUGH_SERIES } from "@/tools/forecast-fixtures";
import { forecastSpecSchema } from "@/tools/spec";
import { AnswerOutcome } from "./answer-card";
import { forecastChartRows } from "./forecast-card";

function forecastFor(horizon?: Record<string, unknown>): ForecastAnswer {
  const answer = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" }, ...(horizon === undefined ? {} : { horizon }) }));
  if (answer.kind !== "forecast") throw new Error(answer.message);
  return answer;
}

function render(forecast: ForecastAnswer): string {
  return renderToStaticMarkup(<AnswerOutcome outcome={{ kind: "forecast", forecast }} onFollowUp={() => undefined} onAsk={() => undefined} />);
}

// What a reader sees, markup between text read as one space.
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

function panelOf(html: string): string {
  const start = html.indexOf("<details");
  return textOf(html.slice(start, html.indexOf("</details>", start)));
}

function visibleOf(html: string): string {
  return textOf(html.slice(0, html.indexOf("<details")));
}

describe("the forecast card (R9, ADR 0003 §7–8)", () => {
  const html = render(forecastFor());

  it("opens with the sentence and the units to plan for, split into forecast and safety stock", () => {
    const text = visibleOf(html);
    expect(text).toContain("Over Jan–Mar 2026, demand is forecast at 285 units; with 120 units of safety stock, that is 405 units to plan for.");
    expect(text).toContain("Units to plan for, Jan–Mar 2026 405 · 285 forecast + 120 safety stock");
  });

  it("lists each month's forecast with its 95% range", () => {
    const text = visibleOf(html);
    expect(text).toContain("Month Forecast 95% range");
    expect(text).toContain("Jan 2026 95.0 13.4–176.6");
    expect(text).toContain("Feb 2026 95.0 0.0–210.5");
    expect(text).toContain("Mar 2026 95.0 0.0–236.4");
  });

  it("shows the January caveat with the answer, and the horizon notes", () => {
    expect(visibleOf(html)).toContain("January 2025's spike is outside the 3-month window, so the forecast does not repeat it.");
    expect(visibleOf(render(forecastFor({ count: 6, unit: "week" })))).toContain("The forecast is monthly, so 6 weeks is shown as 2 months.");
  });
});

describe("the forecast's explanation panel (ADR 0003 §4)", () => {
  const panel = panelOf(render(forecastFor()));

  it("shows every candidate's MAE and WAPE on the held-out months, WAPE with its numerator and denominator, and marks the one chosen", () => {
    expect(panel).toContain("Error on Oct–Dec 2025 Method MAE (units a month) WAPE Absolute error / actual units");
    expect(panel).toContain("All-history average 18.89 19.9%");
    expect(panel).toContain("3-month moving average 16.22 17.1% 48.67 / 285 Chosen");
    expect(panel).toContain("Linear regression 35.21 37.1%");
    expect(panel).toContain("Holt's linear trend 25.24 26.6%");
  });

  it("states the reason for this series, σ, and the plan's arithmetic", () => {
    expect(panel).toContain("On this series the 3-month moving average had the lowest error on Oct–Dec 2025");
    expect(panel).toContain("σ = 41.66 units");
    // σ is 41.6563 unrounded, so the safety stock is 119.05, not the 119.06 the rounded σ would give.
    expect(panel).toContain("1.65 × σ × √3 = 119.05 units");
    expect(panel).toContain("285.00 + 119.05 = 404.05, rounded up to 405 units to plan for");
    expect(panel).toContain("not a reorder quantity");
  });

  it("shows the history and the spec", () => {
    expect(panel).toContain("Jan 2025 233");
    expect(panel).toContain("Dec 2025 93");
    expect(panel).toContain('"tool": "forecast"');
  });
});

describe("a rough forecast", () => {
  it("is labelled rough on the card, with why", () => {
    const rough = render(presentForecast(forecastResultFor(ROUGH_SERIES)));
    expect(visibleOf(rough)).toContain("Rough forecast This forecast is rough: its error on Oct–Dec 2025 was 125.0% of actual demand.");
    expect(visibleOf(render(forecastFor()))).not.toContain("Rough forecast");
  });

  it("says the held-out months had no demand, rather than an error share, when that is why", () => {
    const noDemand = render(presentForecast(forecastResultFor([10, 10, 10, 10, 10, 10, 10, 10, 10, 0, 0, 0])));
    expect(visibleOf(noDemand)).toContain("Oct–Dec 2025 had no demand, and the forecast for them was not 0.");
    expect(textOf(noDemand)).not.toContain("over 50%");
  });
});

describe("the forecast chart's data (ADR 0003 §8)", () => {
  it("joins the history to a dashed forecast at the last month, with the 95% range on the forecast months", () => {
    const rows = forecastChartRows(forecastFor());
    expect(rows).toHaveLength(15);
    expect(rows[0]).toEqual({ label: "Jan 2025", history: 233, forecast: null, range: null });
    // The forecast line starts from the last actual month, so the two lines meet.
    expect(rows[11]).toEqual({ label: "Dec 2025", history: 93, forecast: 93, range: null });
    const january = rows[12];
    expect(january?.label).toBe("Jan 2026");
    expect(january?.history).toBeNull();
    expect(january?.forecast).toBeCloseTo(95, 6);
    expect(january?.range?.map((value) => Number(value.toFixed(1)))).toEqual([13.4, 176.6]);
  });
});
