import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { infoLines, visibleText } from "@/components/markup-text";
import { ForecastPage } from "./forecast-page";
import { getDataset } from "@/domain/orders";

function part(html: string, name: string): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return visibleText(html.slice(start, html.indexOf("</section>", start)));
}

const render = async (params: Record<string, string> = {}) => renderToStaticMarkup(await ForecastPage({ searchParams: Promise.resolve(params), role: "analyst", dataset: getDataset() }));

/** Which links of a control group are the current choice, by their text. */
function pressed(html: string, group: string): string[] {
  const start = html.indexOf(`aria-label="${group}"`);
  const groupHtml = html.slice(start, html.indexOf("</div>", start));
  return [...groupHtml.matchAll(/<a[^>]*aria-current="true"[^>]*>([^<]*)</g)].map((match) => match[1] ?? "");
}

// docs/design/README.md: the 22 scopes at 3 months. Plan, forecast + safety stock, method, WAPE, rough.
const METHODS = { average: "All-history average", moving: "3-month moving average", regression: "Linear regression", holt: "Holt's linear trend" };
const SCOPES: [string, number, number, number, keyof typeof METHODS, string, boolean][] = [
  ["BOOK", 53, 36, 17, "moving", "50.0%", false],
  ["BRUSH", 46, 8, 38, "regression", "73.8%", true],
  ["CRAYON", 55, 11, 44, "holt", "50.0%", false],
  ["MARKER", 53, 31, 22, "average", "26.7%", false],
  ["PAINT", 45, 26, 19, "average", "59.2%", true],
  ["PAPER", 82, 49, 33, "average", "53.2%", true],
  ["PENCIL", 73, 43, 30, "average", "96.0%", true],
  ["STICKER", 93, 56, 37, "average", "31.1%", false],
  ["AMS-FC1", 72, 40, 32, "average", "149.1%", true],
  ["ATL-DC1", 49, 38, 11, "average", "9.4%", false],
  ["BER-FC1", 57, 32, 25, "average", "60.5%", true],
  ["CHI-DC1", 41, 24, 17, "average", "39.3%", false],
  ["DFW-DC1", 56, 33, 23, "average", "41.5%", false],
  ["EWR-DC1", 92, 46, 46, "average", "61.3%", true],
  ["LAX-DC1", 61, 33, 28, "average", "62.1%", true],
  ["LON-FC1", 40, 9, 31, "holt", "289.5%", true],
  ["SFO-DC2", 51, 9, 42, "regression", "222.5%", true],
  ["EU", 118, 73, 45, "average", "76.8%", true],
  ["UK", 40, 9, 31, "holt", "289.5%", true],
  ["US-C", 90, 57, 33, "average", "25.7%", false],
  ["US-E", 137, 83, 54, "average", "44.2%", false],
  ["US-W", 91, 46, 45, "moving", "68.8%", true],
];

describe("the Forecast page (ticket 25, figures from docs/design/README.md)", async () => {
  const html = await render();
  const text = visibleText(html);

  it("is headed Demand forecast with the data's date, and no sentence under it (ticket 30)", () => {
    expect(text).toContain("Forecast Demand forecast Data as of 31 Dec 2025 All products Category Warehouse Region");
    expect(text).not.toContain("One scope at a time");
  });

  it("opens on all products over 3 months, the controls saying so", () => {
    expect(pressed(html, "Scope")).toEqual(["All products"]);
    expect(pressed(html, "Horizon")).toEqual(["3 months"]);
  });

  it("gives the plan, its breakdown, each month with its 95% range in whole units, and the January caveat", () => {
    const card = part(html, "total-title");
    expect(card).toContain("All products · Jan–Mar 2026 3-month moving average Units to plan for 405");
    expect(infoLines(html, "All products · Jan–Mar 2026")).toEqual(["Units ordered per month, by order date · history 1 Jan–31 Dec 2025 · error measured on Oct–Dec 2025"]);
    expect(card).toContain("Units to plan for 405 Forecast demand 285 Safety stock 120");
    expect(card).toContain("Month Forecast 95% range Jan 2026 95 13–177 Feb 2026 95 0–210 Mar 2026 95 0–236");
    expect(card).toContain("January 2025's spike is outside the 3-month window, so the forecast does not repeat it.");
  });

  it("shows every method's error with the chosen one marked, and the plan's arithmetic", () => {
    const chosen = part(html, "How the forecast was chosen");
    expect(chosen).toContain(
      "Method MAE, units WAPE All-history average 18.89 19.9% 3-month moving average · chosen 16.22 17.1% Linear regression 35.21 37.1% Holt's linear trend 25.24 26.6%",
    );
    // The exact sum and one round-up, so the arithmetic reads true for any scope: a demand of 285.6 would not round the stock down.
    expect(chosen).toContain("Forecast demand, 3 months 285.00 Safety stock, 1.65 × σ 41.66 × √3 119.05 Units to plan for, rounded up 404.05 → 405");
    expect(chosen).not.toContain("σ is the root mean square");
  });

  it("puts how the methods were scored and what σ is in the info popovers (ticket 30)", () => {
    expect(infoLines(html, "4 methods, one chosen")).toEqual([
      "Each was fitted on the months before Oct–Dec 2025 and scored on Oct–Dec 2025. The lowest error wins; a tie goes to the simpler method.",
    ]);
    expect(infoLines(html, "From forecast to plan")?.[0]).toBe("The plan covers the forecast plus room for its usual error.");
    expect(infoLines(html, "From forecast to plan")?.[1]).toMatch(/^σ is the root mean square of the method's one-step-ahead errors from /);
    expect(infoLines(html, "By scope, Jan–Mar 2026")).toEqual([
      "Each scope picks its own method. Rough means WAPE over 50% before rounding: plan with care.",
    ]);
  });

  it("forecasts all 22 scopes at 3 months, marking the rough ones and UK's one warehouse", () => {
    const scopes = part(html, "scopes-title");
    expect(scopes).toContain("By scope, Jan–Mar 2026");
    expect([...html.matchAll(/data-scope-card/g)]).toHaveLength(22);
    for (const [name, plan, demand, safety, method, wape, rough] of SCOPES) {
      expect(scopes).toContain(`${name}${rough ? " rough" : ""} ${plan} units ${demand} forecast + ${safety} safety stock ${METHODS[method]} · WAPE ${wape}`);
    }
    expect(scopes).toContain("UK is served only by warehouse LON-FC1, so this forecast is the same as warehouse LON-FC1's.");
  });

  it("says why no SKU is forecast, with the most orders any SKU has, and asks about one on the Ask page", () => {
    expect(text).toContain("SKUs are not forecast: no SKU has more than 3 orders. Forecast demand for SKU CRAYON-0008");
    expect(html).toContain('href="/ask?q=Forecast+demand+for+SKU+CRAYON-0008"');
  });
});

describe("the Forecast page's choice, kept in the URL (ticket 25)", () => {
  it("forecasts the scope and horizon the URL names, matching a value in any case", async () => {
    const html = await render({ scope: "category", value: "crayon", months: "3" });
    expect(pressed(html, "Scope")).toEqual(["Category"]);
    expect(html).toMatch(/<option[^>]*selected=""[^>]*>CRAYON<\/option>|<option[^>]*value="CRAYON"[^>]*selected=""/);
    expect(part(html, "total-title")).toContain("Category CRAYON · Jan–Mar 2026");
    expect(part(html, "total-title")).toContain("Units to plan for 55 Forecast demand 11 Safety stock 44");
    expect(pressed(await render({ months: "6" }), "Horizon")).toEqual(["6 months"]);
    expect(part(await render({ months: "1" }), "total-title")).toContain("All products · Jan 2026");
  });

  it("falls back to all products over 3 months, and says so, for a choice it does not offer", async () => {
    const html = await render({ scope: "planet", value: "Mars", months: "7" });
    expect(pressed(html, "Scope")).toEqual(["All products"]);
    expect(pressed(html, "Horizon")).toEqual(["3 months"]);
    expect(part(html, "total-title")).toContain("Units to plan for 405");
    expect(visibleText(html)).toContain("That choice is not one this page offers, so it shows all products over 3 months.");
  });
});
