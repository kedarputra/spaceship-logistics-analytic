import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OverviewPage from "./page";

// The text a reader sees, with the markup between text nodes read as one space.
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

/** The contents of the element whose aria-label or heading id is `name`, as text. */
function section(html: string, name: string): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no section ${name}`);
  const end = html.indexOf("</section>", start);
  return visibleText(html.slice(start, end));
}

const html = renderToStaticMarkup(<OverviewPage />);
const text = visibleText(html);

describe("the Overview page (ticket 24, figures from docs/design/README.md)", () => {
  it("is headed Overview, with the data's date and the AI status", () => {
    expect(text).toContain("Logistics analytics Overview Delivery performance, carriers and demand for the 400 orders of 2025.");
    expect(text).toContain("Data as of 31 Dec 2025");
    expect(text).toContain("Checking the AI…");
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
    expect(kpis).toContain("Average delivery time 3.8 days Order date to delivery date");
  });

  it("charts orders and delivery outcomes per month, labelling only the highest and lowest order bars", () => {
    const charts = section(html, "Orders and delivery outcomes");
    expect(charts).toContain("Orders per month By order date · 1 Jan–31 Dec 2025 · 400 orders");
    expect(charts).toContain("Delivery outcomes per month By delivery date · 1 Jan–31 Dec 2025 · 370 delivered");
    expect(charts).toContain("On time 304 Delayed 55 Exception 11");
    const barLabels = [...html.matchAll(/data-bar-label="([^"]*)"/g)].map((match) => match[1]);
    expect(barLabels).toEqual(["75", "18"]);
  });

  it("lists every chart's values in a data table", () => {
    const charts = section(html, "Orders and delivery outcomes");
    expect(charts).toContain("Month Orders Jan 2025 75 Feb 2025 36");
    expect(charts).toContain("Month On time Delayed Exception Jan 2025 54 11 2");
  });

  it("ranks the top 4 carriers by delay rate, flags the small sample, and names the highest with at least 20", () => {
    const carriers = section(html, "carriers-title");
    expect(carriers).toContain("Delay rate by carrier Delayed ÷ delivered · by delivery date · top 4 of 9");
    expect(carriers).toContain("GLS n=8 small sample 25.0% USPS n=47 23.4% UPS n=78 21.8% Royal Mail n=25 20.0%");
    expect(carriers).toContain("Among carriers with at least 20 deliveries, USPS is highest at 23.4% (11 of 47).");
    expect(html).toContain('href="/ask?q=What+is+the+delay+rate+by+carrier%3F"');
  });

  it("gives the plan for the next 3 months, its breakdown and the method", () => {
    const forecast = section(html, "forecast-title");
    expect(forecast).toContain("Demand forecast All products · units ordered per month 3-month moving average");
    expect(forecast).toContain("Units to plan for, Jan–Mar 2026 405 285 forecast + 120 safety stock");
  });

  it("keeps the forecast line's values in a data table: units ordered, then the forecast with its 95% range", () => {
    const forecast = section(html, "forecast-title");
    expect(forecast).toContain("Month Units ordered Forecast 95% range Jan 2025 233");
    expect(forecast).toContain("Dec 2025 93 Jan 2026 95.0 13.4–176.6 Feb 2026 95.0 0.0–210.5 Mar 2026 95.0 0.0–236.4");
  });
});
