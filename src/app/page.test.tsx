import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardPage from "./page";

function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

describe("dashboard page", () => {
  it('is headed "Data as of 31 Dec 2025"', () => {
    expect(renderToStaticMarkup(<DashboardPage />)).toContain("Data as of 31 Dec 2025");
  });

  it("shows the five KPI cards computed from the dataset", () => {
    const text = visibleText(renderToStaticMarkup(<DashboardPage />));
    expect(text).toContain("Total orders 400 27 in transit · 3 canceled");
    expect(text).toContain("Delivered orders 370 304 on time · 55 delayed · 11 exception");
    expect(text).toContain("Delayed orders 55");
    expect(text).toContain("On-time delivery rate 82.2% · 304 / 370");
    expect(text).toContain("Average delivery time 3.8 days");
  });

  it("shows the three charts of R2, each naming the date field it counts by", () => {
    const text = visibleText(renderToStaticMarkup(<DashboardPage />));
    expect(text).toContain("Orders per month By order date");
    expect(text).toContain("Delivery outcomes per month By delivery date");
    expect(text).toContain("Delay rate by carrier By delivery date");
  });

  it("lists every chart's values in a data table", () => {
    const text = visibleText(renderToStaticMarkup(<DashboardPage />));
    expect(text).toContain("Jan 2025 75");
    expect(text).toContain("GLS 25.0% 2 / 8 Small sample");
    expect(text).toContain("USPS 23.4% 11 / 47");
  });
});
