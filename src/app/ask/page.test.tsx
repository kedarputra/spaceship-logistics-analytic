import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { infoLines, visibleText } from "@/components/markup-text";
import { AskPage } from "./ask-page";

const render = async (q?: string | string[]) => renderToStaticMarkup(await AskPage({ searchParams: Promise.resolve(q === undefined ? {} : { q }) }));

describe("the Ask page (ticket 24, docs/design/Ask.dc.html)", () => {
  it("is headed as the AI workspace with the data's date, and no sentence under it (ticket 30)", async () => {
    const text = visibleText(await render());
    expect(text).toContain("Ask the data Ask about the data Data as of 31 Dec 2025 Your question");
    expect(text).not.toContain("The AI turns your question");
  });

  it("fills the form with the question in q, to ask on load, with no notes under it (ticket 30)", async () => {
    const html = await render("Which carrier has the highest delay rate?");
    expect(html).toMatch(/<input[^>]*value="Which carrier has the highest delay rate\?"/);
    expect(html).toMatch(/<input[^>]*maxLength="300"/);
    expect(visibleText(html)).not.toContain("questions a minute");
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

  it("says what it won't answer in the info popover of Try these, with the order count computed (ticket 30)", async () => {
    const html = await render();
    expect(infoLines(html, "Try these")?.[0]).toBe(
      "What it won't answer: questions outside these 400 orders, and combined forecast scopes such as crayons at one warehouse.",
    );
    expect(visibleText(html)).not.toContain("What it won't answer");
  });
});
