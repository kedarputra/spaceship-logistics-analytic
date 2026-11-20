import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { type Answer, presentAnswer } from "@/tools/answer";
import { runQuery } from "@/tools/query";
import { querySpecSchema } from "@/tools/spec";
import { AnswerOutcome } from "./answer-card";
import { answerChartProps } from "./answer-chart";

function answerFor(spec: Record<string, unknown>): Answer {
  const result = runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
  if (result.kind !== "result") throw new Error(result.message);
  return presentAnswer(result);
}

function render(answer: Answer): string {
  return renderToStaticMarkup(<AnswerOutcome outcome={{ kind: "answer", answer }} onFollowUp={() => undefined} onAsk={() => undefined} />);
}

// What a reader sees, markup between text read as one space.
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/** The part of the page inside the collapsed explanation panel. */
function panelOf(html: string): string {
  const start = html.indexOf("<details");
  return html.slice(start, html.indexOf("</details>", start));
}

describe("the answer (ADR 0006 §6)", () => {
  it("shows a single value as a number, a rate with its numerator and denominator", () => {
    expect(textOf(render(answerFor({ metric: "delayed_orders", period: { type: "previous", unit: "month" } })))).toContain(
      "Delayed orders 3",
    );
    expect(textOf(render(answerFor({ metric: "on_time_rate" })))).toContain("On-time delivery rate 82.2% · 304 / 370");
  });

  it("always shows the table, with partial weeks named by the days they cover", () => {
    const text = textOf(render(answerFor({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } })));
    expect(text).toContain("w/c 6 Oct 2");
    expect(text).toContain("w/c 29 Sep 0 1–5 Oct only");
  });

  it('draws at most 12 bars and says "35 more in the table" for 47 destinations, all 47 in the table', () => {
    const html = render(answerFor({ metric: "order_count", groupBy: "destination" }));
    expect(textOf(html)).toContain("35 more in the table");
    const visibleTable = html.slice(0, html.indexOf("<details"));
    expect(visibleTable.match(/<tr/g)).toHaveLength(48);
  });

  it("flags small samples with their n in the table", () => {
    expect(textOf(render(answerFor({ metric: "delay_rate", groupBy: "carrier" })))).toContain("GLS 25.0% 2 / 8 8 Small sample");
  });

  it("offers the follow-up chips as buttons", () => {
    const html = render(answerFor({ metric: "delayed_orders", period: { type: "previous", unit: "month" } }));
    expect(html).toContain(">December 2025 instead?</button>");
  });
});

describe("the explanation panel (ADR 0006 §7)", () => {
  const answer = answerFor({ metric: "order_count", filters: { status: ["delayed"], carrier: ["ups"] }, period: { type: "previous", unit: "month" } });
  const panel = panelOf(render(answer));
  const panelText = textOf(panel);

  it("is collapsed by default", () => {
    expect(panel).toMatch(/^<details(?![^>]*\bopen\b)/);
  });

  it("states the interpretation, the period as asked with its dates and date field, the filters and the definition", () => {
    expect(panelText).toContain(answer.interpretation);
    expect(panelText).toContain("Period last month = 1–30 Nov 2025, filtered by delivery date");
    expect(panelText).toContain("Filters carrier: UPS; status: Delayed");
    expect(panelText).toContain("Definition Delivered orders with status delayed. Exception orders are not delayed orders.");
  });

  it("states the rewrite applied and shows the spec as it was validated, before the rewrite", () => {
    expect(panelText).toContain("Rewritten order count with status delayed → delayed orders");
    expect(panel).toContain("&quot;metric&quot;: &quot;order_count&quot;");
  });

  it("shows the result table to 2 decimals", () => {
    expect(textOf(panelOf(render(answerFor({ metric: "on_time_rate" }))))).toContain("82.16%");
  });

  it('lists the matching orders up to 50, then "and N more"', () => {
    const html = panelOf(render(answerFor({ metric: "order_count" })));
    expect(textOf(html)).toContain("and 350 more");
    expect(html).toContain("ORD-2026-");
  });
});

describe("small samples in a chart over time (ADR 0001 §6, ADR 0006 §6)", () => {
  it("draws the months with fewer than 20 deliveries lighter, and says so", () => {
    const answer = answerFor({ metric: "on_time_rate", groupBy: "month" });
    const muted = answerChartProps(answer)?.rows.filter((row) => row.muted).map((row) => row.label);
    expect(muted).toEqual(answer.rows.filter((row) => row.smallSample).map((row) => row.label));
    expect(muted?.length).toBeGreaterThan(0);
    expect(textOf(render(answer))).toContain("Lighter: fewer than 20 delivered orders; n is in the table.");
  });
});

describe("safety and errors", () => {
  it("renders every value as text, never as HTML", () => {
    const answer = answerFor({ metric: "order_count", groupBy: "carrier" });
    const hostile = { ...answer, rows: answer.rows.map((row, index) => (index === 0 ? { ...row, label: '<img src=x onerror="alert(1)">' } : row)) };
    const html = render(hostile);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("opens the answer with its sentence, rendered as text", () => {
    const answer = answerFor({ metric: "delayed_orders", period: { type: "previous", unit: "month" } });
    expect(textOf(render(answer)).trim().startsWith("Delayed orders: 3 in 1–30 Nov 2025, by delivery date.")).toBe(true);
    const html = render({ ...answer, sentence: '<b onclick="steal()">3</b> orders were late.', sentenceSource: "model" });
    expect(html).not.toContain("<b onclick");
    expect(html).toContain("&lt;b onclick=&quot;steal()&quot;&gt;3&lt;/b&gt; orders were late.");
  });

  it("shows the messages the API returned", () => {
    const html = renderToStaticMarkup(
      <AnswerOutcome
        outcome={{ kind: "error", message: "The query spec is not valid.", details: ['Unknown carrier "fedx". Did you mean "FedEx"?'] }}
        onFollowUp={() => undefined}
        onAsk={() => undefined}
      />,
    );
    expect(textOf(html)).toContain("The query spec is not valid. Unknown carrier &quot;fedx&quot;. Did you mean &quot;FedEx&quot;?");
    expect(html).toContain('role="alert"');
  });

  it("shows the no-data message", () => {
    const message = "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025.";
    expect(textOf(renderToStaticMarkup(<AnswerOutcome outcome={{ kind: "no-data", message }} onFollowUp={() => undefined} onAsk={() => undefined} />))).toContain(
      message,
    );
  });
});
