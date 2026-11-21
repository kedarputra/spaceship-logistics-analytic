import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { infoLines, visibleText } from "@/components/markup-text";
import { OverviewPage } from "./overview-page";

/** The contents of the element whose aria-label or heading id is `name`, as text. */
function section(html: string, name: string): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no section ${name}`);
  const end = html.indexOf("</section>", start);
  return visibleText(html.slice(start, end));
}

/** A link to `href` whose text starts with `text`. */
const linkTo = (href: string, text: string) => new RegExp(`<a[^>]*href="${href}"[^>]*>${text}`);

const html = renderToStaticMarkup(<OverviewPage role="analyst" />);
const text = visibleText(html);

describe("the Overview page (ticket 24, figures from docs/design/README.md)", () => {
  it("is headed Overview, with the data's date and the AI status, and no sentence under it (ticket 30)", () => {
    expect(text).toContain("Logistics analytics Overview Data as of 31 Dec 2025 Checking the AI…");
    expect(text).not.toContain("Delivery performance, carriers and demand");
  });

  it("asks in one box, with no explanation under its title (ticket 30)", () => {
    const ask = section(html, "ask-title");
    expect(ask).toContain("Ask about the data Your question Ask How many orders");
    expect(ask).not.toContain("Ask in plain language");
    expect(infoLines(html, "Ask about the data")).toEqual(["Ask in plain language. The answer opens on the Ask page, with how it was computed."]);
  });

  it("asks on the Ask page: the form sends q to /ask, and each chip opens its question there", () => {
    expect(html).toMatch(/<form[^>]*action="\/ask"/);
    expect(html).toMatch(/<input[^>]*name="q"[^>]*maxLength="300"|<input[^>]*maxLength="300"[^>]*name="q"/);
    for (const href of [
      "/ask?q=How+many+orders+were+delivered+late+last+month%3F",
      "/ask?q=Show+delayed+orders+by+week+for+the+last+3+months",
      "/ask?q=Which+carrier+has+the+highest+delay+rate%3F",
      "/ask?q=Forecast+demand+for+the+next+3+months",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("shows the five KPIs with their breakdowns", () => {
    const kpis = section(html, "Key figures");
    expect(kpis).toContain("Total orders 400 27 in transit · 3 canceled");
    expect(kpis).toContain("Delivered orders 370 304 on time 55 delayed 11 exception");
    expect(kpis).toContain("Delayed orders 55 Delay rate 14.9% · 55 / 370");
    expect(kpis).toContain("On-time delivery rate 82.2% 304 / 370");
    expect(kpis).toContain("Average delivery time 3.8 days View the times");
  });

  it("charts orders and delivery outcomes per month, labelling only the highest and lowest order bars", () => {
    const charts = section(html, "Orders and delivery outcomes");
    expect(charts).toContain("Orders per month Data table 0 20 40 60 80 75 18");
    expect(charts).toContain("Delivery outcomes per month Delivery details Data table On time 304");
    expect(charts).toContain("On time 304 Delayed 55 Exception 11");
    const barLabels = [...html.matchAll(/data-bar-label="([^"]*)"/g)].map((match) => match[1]);
    expect(barLabels).toEqual(["75", "18"]);
  });

  it("puts each chart's date basis, period and n in its info popover (ticket 30)", () => {
    expect(infoLines(html, "Orders per month")).toEqual(["By order date · 1 Jan–31 Dec 2025 · 400 orders"]);
    expect(infoLines(html, "Delivery outcomes per month")).toEqual(["By delivery date · 1 Jan–31 Dec 2025 · 370 delivered"]);
    expect(infoLines(html, "Delay rate by carrier")).toEqual(["Delayed ÷ delivered · by delivery date · top 4 of 9"]);
    expect(infoLines(html, "Demand forecast")).toEqual([
      "All products · units ordered per month",
      "Forecasts also run for one category, warehouse or region. A single SKU is never forecast: each has too few orders. A SKU question gets its orders and its category's forecast.",
    ]);
  });

  it("lists every chart's values in a data table", () => {
    const charts = section(html, "Orders and delivery outcomes");
    expect(charts).toContain("Month Orders Jan 2025 75 Feb 2025 36");
    expect(charts).toContain("Month On time Delayed Exception Delivered Jan 2025 54 11 2 67");
  });

  it("ranks the top 4 carriers by delay rate, flags the small sample, and names the highest with at least 20", () => {
    const carriers = section(html, "carriers-title");
    expect(carriers).toContain("Delay rate by carrier GLS n=8");
    expect(carriers).toContain("GLS n=8 small sample 25.0% USPS n=47 23.4% UPS n=78 21.8% Royal Mail n=25 20.0%");
    expect(carriers).toContain("Among carriers with at least 20 deliveries, USPS is highest at 23.4% (11 of 47).");
    expect(html).toMatch(linkTo("/carriers", "All 9 carriers"));
  });

  it("gives the plan for the next 3 months, its breakdown and the method", () => {
    const forecast = section(html, "forecast-title");
    expect(forecast).toContain("Demand forecast 3-month moving average Units to plan for, Jan–Mar 2026 405 285 forecast + 120 safety stock");
    expect(forecast).not.toContain("Forecasts also run");
    expect(html).toMatch(linkTo("/forecast", "Forecast details"));
  });

  it("links the outcomes chart to the Delivery page (ticket 25)", () => {
    expect(html).toMatch(linkTo("/delivery", "Delivery details"));
  });

  it("keeps the forecast line's values in a data table: units ordered, then the forecast with its 95% range", () => {
    const forecast = section(html, "forecast-title");
    expect(forecast).toContain("Month Units ordered Forecast 95% range Jan 2025 233");
    expect(forecast).toContain("Dec 2025 93 Jan 2026 95.0 13.4–176.6 Feb 2026 95.0 0.0–210.5 Mar 2026 95.0 0.0–236.4");
  });
});
