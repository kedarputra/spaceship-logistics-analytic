import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dashboardKpis, KPI_DEFINITIONS } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import { KpiCards } from "./kpi-cards";
import { infoLines, visibleText } from "./markup-text";

// The text a reader sees in each card, with its info popover closed.
function cardTexts(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/gs)].map((match) => visibleText(match[1] ?? "").trim());
}

const html = renderToStaticMarkup(<KpiCards kpis={dashboardKpis(getDataset().orders)} />);

describe("KPI cards (R1, ADR 0001)", () => {
  it("shows the five KPIs of the dataset with their breakdowns, to 1 decimal, and what each opens (ticket 29)", () => {
    expect(cardTexts(html)).toEqual([
      "Total orders 400 27 in transit · 3 canceled View the 400 orders",
      "Delivered orders 370 304 on time 55 delayed 11 exception View the 370 orders",
      "Delayed orders 55 Delay rate 14.9% · 55 / 370 View the 55 orders",
      "On-time delivery rate 82.2% 304 / 370 View the rate by month",
      "Average delivery time 3.8 days View the times by region and warehouse",
    ]);
  });

  it("keeps every KPI's definition one tap away, in the info popover after its label, and off the card (ticket 30)", () => {
    const definitions = Object.values(KPI_DEFINITIONS);
    expect(definitions).toHaveLength(5);
    for (const { label, definition } of definitions) {
      expect(infoLines(html, label)).toEqual([definition]);
      expect(visibleText(html)).not.toContain(definition);
    }
  });

  it('shows "n/a" for the rate and the delivery time when nothing was delivered, and no link to 0 orders (ticket 26)', () => {
    expect(cardTexts(renderToStaticMarkup(<KpiCards kpis={dashboardKpis([])} />))).toEqual([
      "Total orders 0 0 in transit · 0 canceled",
      "Delivered orders 0 0 on time 0 delayed 0 exception",
      "Delayed orders 0 Delay rate n/a · 0 / 0",
      "On-time delivery rate n/a 0 / 0 View the rate by month",
      "Average delivery time n/a View the times by region and warehouse",
    ]);
  });
});
