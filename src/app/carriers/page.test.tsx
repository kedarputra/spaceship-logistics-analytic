import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CarriersPage from "./page";

function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

function part(html: string, name: string, end = "</section>"): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return visibleText(html.slice(start, html.indexOf(end, start)));
}

const html = renderToStaticMarkup(<CarriersPage />);

describe("the Carriers page (ticket 25, figures from docs/design/README.md)", () => {
  it("is headed with how many carriers, orders and deliveries there are, and the small-sample rule", () => {
    expect(visibleText(html)).toContain(
      "Carriers Carriers 9 carriers, 400 orders, 370 delivered. Rates are over delivered orders; carriers with fewer than 20 are marked.",
    );
  });

  it("names the carrier with the most orders, and the highest on-time and delay rates among those with at least 20", () => {
    const highlights = part(html, "Highlights");
    expect(highlights).toContain("Most orders FedEx 89 orders, 22.3% of all · UPS next with 88");
    expect(highlights).toContain("Highest on-time rate, n ≥ 20 DHL 93.1% · 54 of 58 delivered on time");
    expect(highlights).toContain("Highest delay rate, n ≥ 20 USPS 23.4% · 11 of 47 delayed · also the slowest with at least 20, 4.6 days");
  });

  it("ranks all 9 by delay rate, small samples marked, with a note on reading it", () => {
    const chart = part(html, "delay-title", "</figure>");
    expect(chart).toContain("Delay rate by carrier Delayed orders ÷ delivered orders · by delivery date · 1 Jan–31 Dec 2025");
    expect(chart).toContain(
      "GLS n=8 small sample 25.0% USPS n=47 23.4% UPS n=78 21.8% Royal Mail n=25 20.0% OnTrac n=27 14.8% FedEx n=85 12.9% LaserShip n=24 8.3% DHL n=58 5.2% DPD n=18 small sample 0.0%",
    );
    expect(chart).toContain("0% 10% 20% 30%");
    expect(chart).toContain(
      "Reading this chart GLS tops the list on only 8 deliveries. Among carriers with at least 20, USPS is highest at 23.4% (11 of 47). Lighter bars mark fewer than 20 delivered orders: one late delivery more or less moves them by several points.",
    );
  });

  it("tables all 9 carriers by delay rate, with a totals row", () => {
    const table = part(html, "table-title");
    expect(table).toContain("All carriers Sorted by delay rate · orders and share by order date, the rest by delivery date");
    expect(table).toContain("Carrier Orders Share Delivered On-time rate Delay rate ↓ Exceptions Avg delivery time");
    expect(table).toContain(
      [
        "GLS small sample 9 2.3% 8 62.5% 25.0% 1 5.1 days",
        "USPS 49 12.3% 47 74.5% 23.4% 1 4.6 days",
        "UPS 88 22.0% 78 75.6% 21.8% 2 3.9 days",
        "Royal Mail 26 6.5% 25 76.0% 20.0% 1 3.8 days",
        "OnTrac 29 7.3% 27 77.8% 14.8% 2 3.7 days",
        "FedEx 89 22.3% 85 85.9% 12.9% 1 3.6 days",
        "LaserShip 27 6.8% 24 91.7% 8.3% 0 3.5 days",
        "DHL 63 15.8% 58 93.1% 5.2% 1 3.5 days",
        "DPD small sample 20 5.0% 18 88.9% 0.0% 2 3.4 days",
        "All carriers 400 100.0% 370 82.2% 14.9% 11 3.8 days",
      ].join(" "),
    );
  });

  it("offers carrier questions that open on the Ask page", () => {
    expect(html).toContain('href="/ask?q=Which+carrier+is+the+least+reliable%3F"');
    expect(html).toContain('href="/ask?q=What+share+of+orders+went+through+FedEx%3F"');
  });
});
