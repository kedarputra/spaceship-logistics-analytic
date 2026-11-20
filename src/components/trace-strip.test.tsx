import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { answerQuery } from "@/tools/answer";
import { answerForecast } from "@/tools/forecast-answer";
import { forecastSpecSchema, querySpecSchema } from "@/tools/spec";
import type { TraceStage } from "@/tools/trace-stage";
import { AnswerOutcome } from "./answer-card";

const TRACE: TraceStage[] = [
  { stage: "question", detail: "asked in words" },
  { stage: "interpretation", detail: "by the model, after one retry: the first reply was not a valid spec", ms: 410, flagged: true },
  { stage: "tool", detail: "query tool: delayed orders" },
  { stage: "computation", detail: "computed in code", ms: 0 },
  { stage: "result", detail: "14 weeks" },
  { stage: "phrasing", detail: 'template: a number not in the facts', ms: 350, flagged: true },
  { stage: "chart", detail: "vertical bars" },
];

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ");
}

function panelOf(html: string): string {
  const start = html.indexOf("<details");
  return html.slice(start, html.indexOf("</details>", start));
}

const weekly = answerQuery(querySpecSchema.parse({ tool: "query", metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } }));
const forecast = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" } }));
if (weekly.kind !== "result" || forecast.kind !== "forecast") throw new Error("no answer");

const render = (outcome: Parameters<typeof AnswerOutcome>[0]["outcome"]) =>
  renderToStaticMarkup(<AnswerOutcome outcome={outcome} onFollowUp={() => undefined} onAsk={() => undefined} />);

describe("the pipeline trace in the explanation panel (B5, ADR 0008 §4)", () => {
  it("shows the stages in order, with each one's detail and time", () => {
    const panel = textOf(panelOf(render({ kind: "answer", answer: weekly, trace: TRACE })));
    expect(panel).toContain(
      'Pipeline question asked in words → interpretation by the model, after one retry: the first reply was not a valid spec · 410 ms → tool selected query tool: delayed orders → computation computed in code · <1 ms → result 14 weeks → phrasing template: a number not in the facts · 350 ms → chart vertical bars',
    );
  });

  it("marks the stages worth noticing: a retry and a template fallback", () => {
    const html = panelOf(render({ kind: "answer", answer: weekly, trace: TRACE }));
    expect(html.match(/data-flagged="true"/g)).toHaveLength(2);
  });

  it("shows the trace for a forecast too, and nothing when the server sent none", () => {
    expect(textOf(panelOf(render({ kind: "forecast", forecast, trace: TRACE })))).toContain("Pipeline question asked in words");
    expect(textOf(panelOf(render({ kind: "answer", answer: weekly })))).not.toContain("Pipeline");
  });
});

describe("why this chart, in the explanation panel (B5, ADR 0008 §4)", () => {
  it("gives the sentence code wrote from the chart rules", () => {
    expect(textOf(panelOf(render({ kind: "answer", answer: weekly })))).toContain(
      "Why this chart Time + count → vertical bars: each period's count stands on its own.",
    );
    expect(textOf(panelOf(render({ kind: "forecast", forecast })))).toContain(
      "Why this chart History + forecast → a line, the forecast dashed with its 95% range shaded, so it reads as an estimate (ADR 0003 §8).",
    );
  });
});
