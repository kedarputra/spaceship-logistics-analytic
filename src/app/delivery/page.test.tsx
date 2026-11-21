import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { infoLines, visibleText } from "@/components/markup-text";
import { METRICS } from "@/domain/definitions";
import DeliveryPage from "./page";

/** The text of the element labelled `name` (aria-label or the id of its heading), up to its end. */
function part(html: string, name: string, end = "</section>"): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return visibleText(html.slice(start, html.indexOf(end, start)));
}

const html = renderToStaticMarkup(<DeliveryPage />);

describe("the Delivery page (ticket 25, figures from docs/design/README.md)", () => {
  it("is headed Delivery with the data's date, and no sentence under it (ticket 30)", () => {
    expect(visibleText(html)).toContain("Delivery Delivery Data as of 31 Dec 2025 Delivered orders 370");
    expect(visibleText(html)).not.toContain("How the 370 delivered orders arrived");
  });

  it("shows the five delivery KPIs: delivered, on-time rate, delay rate, exceptions with their share, average time", () => {
    const figures = part(html, "Delivery figures");
    expect(figures).toContain("Delivered orders 370 of 400 orders · 30 not delivered: 27 in transit, 3 canceled");
    expect(figures).toContain("On-time delivery rate 82.2% 304 of 370 delivered");
    expect(figures).toContain("Delay rate 14.9% 55 of 370 delivered");
    expect(figures).toContain("Exceptions 11 3.0% of delivered View");
    expect(figures).toContain("Average delivery time 3.8 days View");
  });

  it("keeps each figure's definition in the info popover after its label (ticket 30)", () => {
    expect(infoLines(html, "Delivered orders")).toEqual([METRICS.delivered_orders.definition]);
    expect(infoLines(html, "On-time delivery rate")).toEqual([METRICS.on_time_rate.definition]);
    expect(infoLines(html, "Delay rate")).toEqual([METRICS.delay_rate.definition]);
    expect(infoLines(html, "Exceptions")).toEqual([METRICS.exception_orders.definition]);
    expect(infoLines(html, "Average delivery time")).toEqual([METRICS.average_delivery_time.definition]);
  });

  it("charts delivery outcomes per month, with its data table", () => {
    const outcomes = part(html, "Delivery over time");
    expect(outcomes).toContain("Delivery outcomes per month Data table On time 304 Delayed 55 Exception 11");
    expect(infoLines(html, "Delivery outcomes per month")).toEqual(["By delivery date · 1 Jan–31 Dec 2025 · 370 delivered"]);
    expect(outcomes).toContain("Month On time Delayed Exception Delivered Jan 2025 54 11 2 67");
  });

  it("draws the on-time rate per month as a line against the year's 82.2%, from 60%, with its two small months hollow", () => {
    const line = part(html, "ontime-title", "</figure>");
    expect(line).toContain("On-time delivery rate per month Data table Monthly rate Year: 82.2% Under 20 deliveries 60% 70% 80% 90% 100% 89.3% 72.7%");
    expect(infoLines(html, "On-time delivery rate per month")).toEqual([
      "On-time ÷ delivered · by delivery date",
      "Jun (15 of 18) and Nov (16 of 19) had fewer than 20 deliveries, so one delivery more or less moves them by several points.",
      "The axis starts at 60%.",
    ]);
    expect(line).not.toContain("The axis starts");
    expect([...html.matchAll(/data-small-sample="true"/g)]).toHaveLength(2);
    expect([...html.matchAll(/data-point-label="([^"]*)"/g)].map((match) => match[1])).toEqual(["89.3%", "72.7%"]);
  });

  it("lists every month's on-time rate in its data table", () => {
    const line = part(html, "ontime-title", "</figure>");
    const rates = ["80.6", "81.1", "84.2", "89.3", "72.7", "83.3", "80.0", "81.1", "85.7", "81.8", "84.2", "84.6"];
    for (const [index, rate] of rates.entries()) expect(line).toContain(`${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index]} 2025 ${rate}%`);
    expect(line).toContain("Jun 2025 83.3% 15 / 18 Small sample");
    expect(line).toContain("Nov 2025 84.2% 16 / 19 Small sample");
  });

  it("ranks regions and warehouses by average delivery time, slowest first, each with n and its on-time rate", () => {
    expect(infoLines(html, "Average delivery time by region")).toEqual(["Days from order to delivery · slowest first"]);
    expect(infoLines(html, "Average delivery time by warehouse")).toEqual(["Days from order to delivery · slowest first"]);
    expect(part(html, "regions-title", "</figure>")).toContain(
      "US-C n=71 · 81.7% on time 4.6 days EU n=72 · 81.9% on time 4.2 days UK n=49 · 81.6% on time 3.7 days US-E n=90 · 78.9% on time 3.6 days US-W n=88 · 86.4% on time 3.3 days",
    );
    expect(part(html, "warehouses-title", "</figure>")).toContain(
      [
        "DFW-DC1 n=39 · 82.1% on time 4.6 days",
        "CHI-DC1 n=32 · 81.3% on time 4.5 days",
        "AMS-FC1 n=40 · 82.5% on time 4.2 days",
        "BER-FC1 n=32 · 81.3% on time 4.1 days",
        "LON-FC1 n=49 · 81.6% on time 3.7 days",
        "EWR-DC1 n=46 · 80.4% on time 3.6 days",
        "ATL-DC1 n=44 · 77.3% on time 3.5 days",
        "SFO-DC2 n=44 · 88.6% on time 3.4 days",
        "LAX-DC1 n=44 · 84.1% on time 3.3 days",
      ].join(" "),
    );
  });
});
