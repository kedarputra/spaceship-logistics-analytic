import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GROSS_VALUE_NOTE } from "@/components/gross-value";
import { infoLines, visibleText } from "@/components/markup-text";
import { NetworkPage, readScorecardSort, scorecardSortHref } from "./network-page";

// Golden numbers: ticket 33, recomputed from data/mock_logistics_data.csv.
const render = async (params: Record<string, string> = {}) => renderToStaticMarkup(await NetworkPage({ searchParams: Promise.resolve(params) }));
const html = await render();

/** The markup inside a named part, up to the end of its section. */
function part(markup: string, name: string): string {
  const start = markup.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return markup.slice(markup.indexOf(">", start) + 1, markup.indexOf("</section>", start));
}

/** The visible text of each body row, cells split by " | ". */
function bodyRows(markup: string): string[] {
  const body = markup.slice(markup.indexOf("<tbody"), markup.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row = ""]) => visibleText(row.replace(/<\/t[dh]>/g, " | </td>")).trim());
}

/** Each column heading's text, its sort link and its aria-sort when it has one. */
function headings(markup: string): { text: string; href?: string; sort?: string }[] {
  return [...markup.matchAll(/<th scope="col"([^>]*)>(.*?)<\/th>/gs)].map(([, attributes = "", inner = ""]) => ({
    text: visibleText(inner).trim(),
    href: /href="([^"]*)"/.exec(inner)?.[1]?.replace(/&amp;/g, "&"),
    sort: /aria-sort="([^"]+)"/.exec(attributes)?.[1],
  }));
}

/** Every link as [accessible name, href], &amp; read back. */
function links(markup: string): [string, string][] {
  return [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].map(([, attributes = "", inner = ""]) => [
    (/aria-label="([^"]*)"/.exec(attributes)?.[1] ?? visibleText(inner).trim()).replace(/&amp;/g, "&"),
    (/href="([^"]*)"/.exec(attributes)?.[1] ?? "").replace(/&amp;/g, "&"),
  ]);
}

describe("the Network page (ticket 33)", () => {
  it("is headed Network with the data's date, and no sentence under it", () => {
    expect(visibleText(html)).toContain("Network Network Data as of 31 Dec 2025 Warehouse scorecard");
  });

  it("scores the 9 warehouses, highest on-time rate first, best and worst marked with an icon and a word, and a total", () => {
    const scorecard = part(html, "warehouses-title");
    expect(bodyRows(scorecard)).toEqual([
      "SFO-DC2 best on time | 46 | 156 | $1,397.57 | 44 | 88.6% | 11.4% | 3.4 days |",
      "LAX-DC1 | 46 | 132 | $1,407.88 | 44 | 84.1% | 13.6% | 3.3 days |",
      "AMS-FC1 | 43 | 161 | $1,422.57 | 40 | 82.5% | 15.0% | 4.2 days |",
      "DFW-DC1 | 42 | 131 | $1,419.56 | 39 | 82.1% | 15.4% | 4.6 days |",
      "LON-FC1 | 54 | 172 | $1,725.45 | 49 | 81.6% | 16.3% | 3.7 days |",
      // 26 of 32 is 81.25%, which reads 81.3% as on the Delivery page.
      "BER-FC1 | 38 | 129 | $1,458.01 | 32 | 81.3% | 15.6% | 4.1 days |",
      "CHI-DC1 | 36 | 96 | $1,062.84 | 32 | 81.3% | 12.5% | 4.5 days |",
      "EWR-DC1 | 49 | 183 | $2,252.69 | 46 | 80.4% | 13.0% | 3.6 days |",
      "ATL-DC1 worst on time | 46 | 150 | $1,549.30 | 44 | 77.3% | 20.5% | 3.5 days |",
    ]);
    expect(visibleText(scorecard.slice(scorecard.indexOf("<tfoot"))).trim()).toBe("All warehouses 400 1,310 $13,695.87 370 82.2% 14.9% 3.8 days");
    // An icon beside each word.
    expect(scorecard).toMatch(/<svg[^>]*>.*?<\/svg>best on time/s);
    expect(scorecard).toMatch(/<svg[^>]*>.*?<\/svg>worst on time/s);
    expect(infoLines(html, "Warehouse scorecard")).toContain(GROSS_VALUE_NOTE);
  });

  it("sorts the scorecard by any heading: the first click highest first (names A to Z), a second reverses it", () => {
    const scorecard = part(html, "warehouses-title");
    expect(headings(scorecard)).toEqual([
      { text: "Warehouse", href: "/network?sort=warehouse&dir=asc" },
      { text: "Orders", href: "/network?sort=order_count&dir=desc" },
      { text: "Units", href: "/network?sort=units&dir=desc" },
      { text: "Gross value", href: "/network?sort=gross_order_value&dir=desc" },
      { text: "Delivered", href: "/network?sort=delivered_orders&dir=desc" },
      { text: "On-time rate ↓", href: "/network?sort=on_time_rate&dir=asc", sort: "descending" },
      { text: "Delay rate", href: "/network?sort=delay_rate&dir=desc" },
      { text: "Avg delivery time", href: "/network?sort=average_delivery_time&dir=desc" },
    ]);
  });

  it("opens a sorted scorecard from its URL: by orders, most first, LON-FC1 with 54", async () => {
    const scorecard = part(await render({ sort: "order_count", dir: "desc" }), "warehouses-title");
    expect(bodyRows(scorecard)[0]).toMatch(/^LON-FC1 \| 54 \| /);
    expect(headings(scorecard)[1]).toEqual({ text: "Orders ↓", href: "/network?sort=order_count&dir=asc", sort: "descending" });
    const ascending = part(await render({ sort: "order_count", dir: "asc" }), "warehouses-title");
    expect(headings(ascending)[1]).toEqual({ text: "Orders ↑", href: "/network?sort=order_count&dir=desc", sort: "ascending" });
    expect(bodyRows(ascending)[0]).toMatch(/^CHI-DC1 \| 36 \| /);
    // Reversing on-time rate back to highest first is the plain page.
    expect(scorecardSortHref({ column: "on_time_rate", direction: "asc" }, "on_time_rate")).toBe("/network");
  });

  it("reads an unknown sort as the default, and a sort without a direction as that column's first", () => {
    expect(readScorecardSort({ sort: "price" })).toEqual({ column: "on_time_rate", direction: "desc" });
    expect(readScorecardSort({ sort: "warehouse" })).toEqual({ column: "warehouse", direction: "asc" });
    expect(readScorecardSort({ sort: "gross_order_value", dir: "sideways" })).toEqual({ column: "gross_order_value", direction: "desc" });
  });

  it("opens each warehouse's orders in Raw data", () => {
    const warehouseLinks = links(part(html, "warehouses-title")).filter(([name]) => name.includes(": view the "));
    expect(warehouseLinks).toHaveLength(9);
    expect(warehouseLinks[0]).toEqual(["SFO-DC2: view the 46 orders", "/data?warehouse=SFO-DC2"]);
  });

  it("lists the 47 lanes by orders, every one a small sample, with the reason in the info popover", () => {
    const lanes = part(html, "lanes-title");
    const rows = bodyRows(lanes);
    expect(rows).toHaveLength(47);
    expect(rows.slice(0, 5)).toEqual([
      "London, UK → Leeds, UK small sample | 15 | 14 | 78.6% | 3.6 days |",
      "Newark, NJ → Boston, MA small sample | 15 | 14 | 78.6% | 3.4 days |",
      "Atlanta, GA → Orlando, FL small sample | 13 | 13 | 76.9% | 4.0 days |",
      "Berlin, DE → Zurich, CH small sample | 13 | 12 | 91.7% | 3.4 days |",
      "London, UK → Edinburgh, UK small sample | 13 | 11 | 72.7% | 4.4 days |",
    ]);
    expect(rows.every((row) => row.includes(" small sample |"))).toBe(true);
    expect(visibleText(lanes)).toContain("Lanes 47 lanes Lane Orders ↓ Delivered On-time rate Avg delivery time");
    expect(infoLines(html, "Lanes")).toEqual([
      "Origin city → destination city, most orders first.",
      "No lane has 20 delivered orders, so the rates per lane are indicative only.",
      "Rates and the average delivery time are over delivered orders.",
    ]);
  });

  it("opens each lane's orders in Raw data by origin and destination", () => {
    const laneLinks = links(part(html, "lanes-title"));
    expect(laneLinks).toHaveLength(47);
    expect(laneLinks[0]).toEqual(["London, UK → Leeds, UK: view the 15 orders", "/data?origin=London%2C+UK&destination=Leeds%2C+UK"]);
  });

  it("lists the 30 clients by gross value, small samples under 20 delivered marked", () => {
    const clients = part(html, "clients-title");
    const rows = bodyRows(clients);
    expect(rows).toHaveLength(30);
    expect(rows.slice(0, 6)).toEqual([
      "CL-1004 | 46 | 135 | $1,755.34 | 43 | 76.7% | 3.7 days |",
      "CL-1005 | 36 | 128 | $1,403.02 | 33 | 84.8% | 3.5 days |",
      "CL-1002 | 31 | 120 | $1,124.72 | 28 | 71.4% | 3.9 days |",
      "CL-1003 | 33 | 143 | $1,109.36 | 29 | 86.2% | 4.0 days |",
      "CL-1001 | 35 | 116 | $1,058.90 | 31 | 87.1% | 4.2 days |",
      "CL-1013 small sample | 8 | 51 | $856.36 | 8 | 100.0% | 2.4 days |",
    ]);
    expect(rows.filter((row) => row.includes(" small sample |"))).toHaveLength(25);
    expect(visibleText(clients)).toContain("Clients 30 clients Client Orders Units Gross value ↓ Delivered On-time rate Avg delivery time");
    expect(infoLines(html, "Clients")).toContain(GROSS_VALUE_NOTE);
  });

  it("opens each client's orders in Raw data", () => {
    const clientLinks = links(part(html, "clients-title"));
    expect(clientLinks).toHaveLength(30);
    expect(clientLinks[0]).toEqual(["CL-1004: view the 46 orders", "/data?client=CL-1004"]);
  });
});
