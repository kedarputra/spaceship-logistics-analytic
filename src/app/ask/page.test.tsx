import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AskPage from "./page";

function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

const render = async (q?: string | string[]) => renderToStaticMarkup(await AskPage({ searchParams: Promise.resolve(q === undefined ? {} : { q }) }));

describe("the Ask page (ticket 24, docs/design/Ask.dc.html)", () => {
  it("is headed as the AI workspace, and says what the AI does and does not do", async () => {
    expect(visibleText(await render())).toContain(
      "Ask the data Ask about the data The AI turns your question into a query spec. Code checks the spec against a whitelist and computes the answer; the AI only words it.",
    );
  });

  it("fills the form with the question in q, to ask on load, and states the limits", async () => {
    const html = await render("Which carrier has the highest delay rate?");
    expect(html).toMatch(/<input[^>]*value="Which carrier has the highest delay rate\?"/);
    expect(visibleText(html)).toContain("Up to 300 characters · 20 questions a minute per visitor");
    expect(await render()).toMatch(/<input(?![^>]*value="[^"])/);
    expect(await render(["one", "two"])).toMatch(/<input[^>]*value="one"/);
  });

  it("suggests questions in four groups, each a button that asks it", async () => {
    const html = await render();
    expect(visibleText(html)).toContain(
      "Try these Counts and shares How many orders were delivered late last month? What fraction of all orders used a promotion? Over time Show delayed orders by week for the last 3 months Show the monthly on-time delivery rate Rankings Which region takes the longest to deliver an order? Which carrier is the least reliable? Forecasts Forecast demand for the next 3 months Forecast CRAYON demand for the next 3 months",
    );
    expect(html).toContain('<button type="button" class="chip chip-wide">Which carrier is the least reliable?</button>');
  });

  it("says what it won't answer, with the order count computed", async () => {
    expect(visibleText(await render())).toContain(
      "What it won't answer Questions outside these 400 orders, and combined forecast scopes such as crayons at one warehouse.",
    );
  });
});
