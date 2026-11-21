import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { forecastAnswerOf } from "@/tools/forecast-fixtures";
import { answerTip } from "./chart";
import { ChartTip } from "./chart-tip";
import { forecastChartRows } from "./forecast-card";
import { forecastTip } from "./forecast-chart";
import { MARKS } from "./palette";
import { OUTCOME_SERIES, singleSeries } from "./series";

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("one tooltip look (ticket 26)", () => {
  it("heads with the month, then the value in bold ink before the series name, keyed by the series colour, and the foot", () => {
    const html = renderToStaticMarkup(
      <ChartTip tip={{ heading: "Jun 2025", rows: [{ value: "83.3%", name: "on time", color: MARKS.onTime }], note: "15 of 18 delivered on time", smallSample: true }} foot="Click to view the 18 delivered orders" />,
    );
    expect(textOf(html)).toBe("Jun 2025 83.3% on time 15 of 18 delivered on time small sample Click to view the 18 delivered orders");
    expect(html).toContain(`style="background-color:${MARKS.onTime}"></span><span class="font-bold text-ink">83.3%</span><span class="text-muted">on time</span>`);
    expect(html).toContain("rounded-card border border-line bg-panel");
  });
});

describe("the Forecast chart's tooltip (ticket 26)", () => {
  const rows = forecastChartRows(forecastAnswerOf({ scope: { type: "total" } }));

  it("a forecast month reads the forecast and its 95% range in whole units: Jan 2026, 95 and 13–177", () => {
    const january = rows.find((row) => row.label === "Jan 2026");
    if (january === undefined) throw new Error("no Jan 2026");
    // docs/design/README.md: Jan 95 (13–177).
    expect(forecastTip(january)).toEqual({
      heading: "Jan 2026",
      rows: [
        { value: "95 units", name: "forecast", color: MARKS.forecastLine },
        { value: "13–177 units", name: "95% range", color: MARKS.band },
      ],
    });
  });

  it("a month of history reads the units ordered, once, even where the forecast line starts", () => {
    // docs/data.md: units per month, Jan 233 and Dec 93.
    expect(forecastTip(rows[0] ?? { label: "", history: null, forecast: null, range: null }).rows).toEqual([{ value: "233 units", name: "ordered", color: MARKS.onTime }]);
    const december = rows.find((row) => row.label === "Dec 2025");
    expect(december?.forecast).toBe(93);
    expect(december === undefined ? [] : forecastTip(december).rows).toEqual([{ value: "93 units", name: "ordered", color: MARKS.onTime }]);
  });
});

describe("the Ask answer chart's tooltip (ticket 26)", () => {
  it("lists each series in legend order with its value as the metric writes it", () => {
    const row = { label: "Jan 2025", values: { onTime: 54, delayed: 11, exception: 2 } };
    expect(answerTip(row, OUTCOME_SERIES, "orders")).toEqual({
      heading: "Jan 2025",
      rows: [
        { value: "54", name: "on time", color: MARKS.onTime },
        { value: "11", name: "delayed", color: MARKS.delayed },
        { value: "2", name: "exception", color: MARKS.exception },
      ],
      smallSample: false,
    });
  });

  it("marks a small sample, and leaves out a series with no value", () => {
    const tip = answerTip({ label: "GLS", values: { value: 0.25 }, muted: true }, [singleSeries("delay_rate", "Delay rate")], "percent");
    expect(tip).toEqual({ heading: "GLS", rows: [{ value: "25.0%", name: "delay rate", color: MARKS.delayed }], smallSample: true });
    expect(answerTip({ label: "GLS", values: { value: null } }, [singleSeries("delay_rate", "Delay rate")], "percent").rows).toEqual([]);
  });
});
