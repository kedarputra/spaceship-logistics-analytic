import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { answerQuery } from "@/tools/answer";
import { answerForecast } from "@/tools/forecast-answer";
import { forecastSpecSchema, querySpecSchema } from "@/tools/spec";
import { AnswerOutcome } from "./answer-card";
import { HistoryList } from "./history-list";
import { infoLines } from "./markup-text";

const ENTRIES = [
  { question: "How much inventory should I plan?", spec: { tool: "forecast" as const, scope: { type: "total" } }, askedAt: "2026-11-20T07:40:00.000Z" },
  {
    question: "How many orders were delivered late last month?",
    spec: { tool: "query" as const, metric: "delayed_orders", period: { type: "previous", unit: "month" } },
    askedAt: "2026-11-20T07:32:00.000Z",
  },
];

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

function render(entries: typeof ENTRIES): string {
  return renderToStaticMarkup(<HistoryList entries={entries} onRerun={() => undefined} onClear={() => undefined} />);
}

describe("the history list (B1, ADR 0008 §1)", () => {
  it("lists the questions newest first, each a button with the time it was asked", () => {
    const html = render(ENTRIES);
    const text = textOf(html);
    expect(text).toContain("Recent questions");
    expect(text.indexOf("How much inventory should I plan?")).toBeLessThan(text.indexOf("How many orders were delivered late last month?"));
    expect(html.match(/<li/g)).toHaveLength(2);
    // Local time, "20 Nov, 14:40" in WIB: worked out here from the clock's own fields, whatever the time zone.
    const asked = new Date("2026-11-20T07:40:00.000Z");
    const two = (value: number) => String(value).padStart(2, "0");
    expect(text).toContain(`${asked.getDate()} Nov, ${two(asked.getHours())}:${two(asked.getMinutes())}`);
    expect(html).toContain('dateTime="2026-11-20T07:40:00.000Z"');
  });

  it('has a "Clear history" button, and says in its info popover that the history stays in this browser and re-runs without the AI', () => {
    const html = render(ENTRIES);
    expect(textOf(html)).toContain("Clear history");
    expect(infoLines(html, "Recent questions")).toEqual(["Kept in this browser only. A re-run uses the saved spec, without the AI."]);
  });

  it("shows nothing when there is no history", () => {
    expect(render([])).toBe("");
  });
});

describe('the "Cached" marker on an answer the server cache served', () => {
  const answer = answerQuery(querySpecSchema.parse({ tool: "query", metric: "order_count" }));
  const forecast = answerForecast(forecastSpecSchema.parse({ tool: "forecast", scope: { type: "total" } }));
  if (answer.kind !== "result" || forecast.kind !== "forecast") throw new Error("no answer");
  const html = (cached: boolean, kind: "answer" | "forecast") =>
    renderToStaticMarkup(
      <AnswerOutcome
        outcome={kind === "answer" ? { kind, answer, cached } : { kind, forecast, cached }}
        onFollowUp={() => undefined}
        onAsk={() => undefined}
      />,
    );

  it("marks a cached answer and a cached forecast, and nothing else; how this was computed says what the cache is (ticket 30)", () => {
    const card = (markup: string) => textOf(markup.slice(0, markup.indexOf("<section data-explanation")));
    const panel = (markup: string) => textOf(markup.slice(markup.indexOf("<section data-explanation")));
    expect(card(html(true, "answer"))).toContain("Cached");
    expect(card(html(true, "answer"))).not.toContain("Served from");
    expect(panel(html(true, "answer"))).toContain("Cache Served from the server's cache of earlier questions.");
    // A cache hit can still phrase its sentence again with the model, so the marker claims no more than the cache.
    expect(textOf(html(true, "answer"))).not.toContain("no new model call");
    expect(card(html(true, "forecast"))).toContain("Cached");
    expect(panel(html(true, "forecast"))).toContain("Cache Served from the server's cache of earlier questions.");
    expect(textOf(html(false, "answer"))).not.toContain("Cached");
    expect(textOf(html(false, "forecast"))).not.toContain("Cached");
  });
});
