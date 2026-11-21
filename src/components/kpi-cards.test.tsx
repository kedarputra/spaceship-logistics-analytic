import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dashboardKpis, KPI_DEFINITIONS } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import { KpiCards } from "./kpi-cards";

// The text a reader sees in each card, with the markup between text nodes read as one space.
function cardTexts(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map((match) =>
    (match[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
  );
}

/** A card's text: its label, figures and definition, then the line at its foot that says what it opens (ticket 29), if it opens anything. */
function card(kpi: keyof typeof KPI_DEFINITIONS, figures: string, foot?: string): string {
  const { label, definition } = KPI_DEFINITIONS[kpi];
  return `${label} ${figures} ${definition}${foot === undefined ? "" : ` ${foot}`}`;
}

describe("KPI cards (R1, ADR 0001)", () => {
  it("shows the five KPIs of the dataset with their breakdowns, to 1 decimal", () => {
    const html = renderToStaticMarkup(<KpiCards kpis={dashboardKpis(getDataset().orders)} />);
    expect(cardTexts(html)).toEqual([
      card("totalOrders", "400 27 in transit · 3 canceled", "View the 400 orders"),
      card("deliveredOrders", "370 304 on time 55 delayed 11 exception", "View the 370 orders"),
      card("delayedOrders", "55 Delay rate 14.9% · 55 / 370", "View the 55 orders"),
      card("onTimeRate", "82.2% 304 / 370", "View the rate by month"),
      card("averageDeliveryDays", "3.8 days Order date to delivery date", "View the times by region and warehouse"),
    ]);
  });

  it('shows "n/a" for the rate and the delivery time when nothing was delivered, and no link to 0 orders (ticket 26)', () => {
    const html = renderToStaticMarkup(<KpiCards kpis={dashboardKpis([])} />);
    expect(cardTexts(html)).toEqual([
      card("totalOrders", "0 0 in transit · 0 canceled"),
      card("deliveredOrders", "0 0 on time 0 delayed 0 exception"),
      card("delayedOrders", "0 Delay rate n/a · 0 / 0"),
      card("onTimeRate", "n/a 0 / 0", "View the rate by month"),
      card("averageDeliveryDays", "n/a Order date to delivery date", "View the times by region and warehouse"),
    ]);
  });
});
