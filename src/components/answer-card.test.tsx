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
  return presentAnswer(result, getDataset().orders);
}

function render(answer: Answer): string {
  return renderToStaticMarkup(<AnswerOutcome outcome={{ kind: "answer", answer }} onFollowUp={() => undefined} onAsk={() => undefined} />);
}

// What a reader sees, markup between text read as one space.
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

/** The explanation panel, How this was computed: its heading and its region. */
function panelOf(html: string): string {
  const start = html.indexOf("<section data-explanation");
  return html.slice(start, html.indexOf("</section>", start));
}

/** The answer before its explanation panel. */
function cardOf(html: string): string {
  return html.slice(0, html.indexOf("<section data-explanation"));
}

/** The chips under the answer: what was computed. */
function chipsOf(html: string): string[] {
  const list = /<ul aria-label="What was computed"[^>]*>(.*?)<\/ul>/s.exec(html)?.[1] ?? "";
  return [...list.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((match) => textOf(match[1] ?? "").trim());
}

describe("the answer (ADR 0006 §6)", () => {
  it("shows a single value as a number, a rate with its numerator and denominator", () => {
    expect(textOf(render(answerFor({ metric: "delayed_orders", period: { type: "previous", unit: "month" } })))).toContain(
      "Delayed orders 3",
    );
    expect(textOf(render(answerFor({ metric: "on_time_rate" })))).toContain("On-time delivery rate 82.2% · 304 / 370");
  });

  it("always shows the table on the answer, with partial weeks named by the days they cover (ADR 0006 §6)", () => {
    const text = textOf(cardOf(render(answerFor({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } }))));
    expect(text).toContain("w/c 6 Oct 2");
    expect(text).toContain("w/c 29 Sep 0 1–5 Oct only");
  });

  it('draws at most 12 bars and says "35 more in the table" for 47 destinations, all 47 in the table', () => {
    const html = render(answerFor({ metric: "order_count", groupBy: "destination" }));
    expect(textOf(cardOf(html))).toContain("35 more in the table");
    expect(cardOf(html).match(/<tr/g)).toHaveLength(48);
  });

  it("flags small samples with their n in the table", () => {
    expect(textOf(cardOf(render(answerFor({ metric: "delay_rate", groupBy: "carrier" }))))).toContain("GLS 25.0% 2 / 8 8 Small sample");
  });

  it("names what was computed in a row of chips under the answer: the metric, the dimension, the filters and the resolved period (ticket 30)", () => {
    const html = render(answerFor({ metric: "delay_rate", groupBy: "carrier", filters: { region: ["EU", "UK"] }, period: { type: "previous", unit: "month" } }));
    expect(chipsOf(cardOf(html))).toEqual(["Delay rate", "by carrier", "Region: EU, UK", "Nov 2025 · by delivery date"]);
    expect(chipsOf(cardOf(render(answerFor({ metric: "order_count" }))))).toEqual(["Orders", "Jan–Dec 2025 · by order date"]);
    // A period that is not whole months keeps its days: last week, by ADR 0002's Monday weeks.
    expect(chipsOf(cardOf(render(answerFor({ metric: "order_count", period: { type: "previous", unit: "week" } }))))).toEqual([
      "Orders",
      "22–28 Dec 2025 · by order date",
    ]);
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

  it("is closed by default, its heading a button that says so (ticket 30)", () => {
    expect(panel).toMatch(/<button[^>]*aria-expanded="false"[^>]*>.*How this was computed/s);
    expect(panel).toMatch(/<div[^>]*inert=""[^>]*class="collapsible/);
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
    expect(textOf(cardOf(render(answer)))).toContain("Lighter: fewer than 20 delivered orders; n is in the table.");
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

  it("shows nothing before the first question: the suggested questions are the idle state (ticket 30)", () => {
    expect(renderToStaticMarkup(<AnswerOutcome outcome={{ kind: "idle" }} onFollowUp={() => undefined} onAsk={() => undefined} />)).toBe("");
  });

  it("shows the no-data message", () => {
    const message = "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025.";
    expect(textOf(renderToStaticMarkup(<AnswerOutcome outcome={{ kind: "no-data", message }} onFollowUp={() => undefined} onAsk={() => undefined} />))).toContain(
      message,
    );
  });
});

describe("the answer on the Ask page (ticket 24, docs/design/Ask.dc.html)", () => {
  const ranking = answerFor({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 });

  it("says who wrote the sentence: the model, every number checked, or code", () => {
    expect(textOf(render({ ...ranking, sentenceSource: "model" }))).toContain("Written by the model, every number checked");
    expect(textOf(render({ ...ranking, sentenceSource: "template" }))).toContain("Written by code from the result");
  });

  it("names the question it answers when given one", () => {
    const html = renderToStaticMarkup(
      <AnswerOutcome
        question="Which carrier has the highest delay rate?"
        outcome={{ kind: "answer", answer: ranking }}
        onFollowUp={() => undefined}
        onAsk={() => undefined}
      />,
    );
    expect(textOf(html).trim().startsWith("Which carrier has the highest delay rate?")).toBe(true);
  });

  it("ranks as bars with n and the small-sample tag, adding the first group with at least 20 when the top is a small sample", () => {
    const text = textOf(render(ranking));
    expect(text).toContain("GLS n=8 small sample 25.0% USPS n=47 first with n ≥ 20 23.4%");
    expect(text).toContain("USPS 23.4% 11 / 47 47 First with n ≥ 20");
  });
});

// Expected figures: docs/data.md (USPS 11 of 47 delivered; 3 delayed orders delivered in Nov 2025).
describe("the orders behind an answer (ticket 29)", () => {
  it("opens the USPS delay rate's 47 delivered orders, those it divides by, in Raw data from How this was computed", () => {
    expect(panelOf(render(answerFor({ metric: "delay_rate", filters: { carrier: ["USPS"] } })))).toMatch(
      /<a[^>]*href="\/data\?status=delivered&amp;status=delayed&amp;status=exception&amp;carrier=USPS&amp;date=delivery"[^>]*>Open the 47 delivered orders behind this answer/,
    );
  });

  it("opens a period's orders on the answer's date field: 3 delayed orders delivered in Nov 2025", () => {
    expect(panelOf(render(answerFor({ metric: "delayed_orders", period: { type: "month", month: 11, year: 2025 } })))).toMatch(
      /<a[^>]*href="\/data\?status=delayed&amp;date=delivery&amp;from=2025-11&amp;to=2025-11"[^>]*>Open the 3 orders behind this answer/,
    );
  });

  it("has no link when a part of the spec has no Raw data filter", () => {
    expect(render(answerFor({ metric: "order_count", filters: { sku: ["CRAYON-0008"] } }))).not.toContain("behind this answer");
  });
});
