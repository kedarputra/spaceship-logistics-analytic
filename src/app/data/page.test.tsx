import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { infoLines, visibleText as readerText } from "@/components/markup-text";
import { METRICS } from "@/domain/definitions";
import { DataPage } from "./data-page";

// The filter form navigates with Next's router, which only exists inside a running app; the markup is what is under test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

/** The text a reader sees, info popovers closed, trimmed. */
function visibleText(html: string): string {
  return readerText(html).trim();
}

/** The markup inside a named part (aria-label or aria-labelledby), up to `end`. */
function part(html: string, name: string, end = "</section>"): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return html.slice(html.indexOf(">", start) + 1, html.indexOf(end, start));
}

/** The checkboxes of a form, as name=value, and which of them are checked. */
function checkboxes(html: string): { field: string; checked: boolean }[] {
  return [...html.matchAll(/<input type="checkbox"([^>]*)>/g)].map(([, attributes = ""]) => ({
    field: `${/name="([^"]*)"/.exec(attributes)?.[1]}=${/value="([^"]*)"/.exec(attributes)?.[1]}`,
    checked: /\bchecked=/.test(attributes),
  }));
}

const render = async (params: Record<string, string | string[]> = {}) => renderToStaticMarkup(await DataPage({ searchParams: Promise.resolve(params), role: "analyst" }));

/** Each column heading's text, and its aria-sort when it has one. */
function headings(html: string): string[] {
  return [...html.matchAll(/<th scope="col"([^>]*)>(.*?)<\/th>/gs)].map(([, attributes = "", inner = ""]) => {
    const sort = /aria-sort="([^"]+)"/.exec(attributes)?.[1];
    return sort === undefined ? visibleText(inner) : `${visibleText(inner)} (${sort})`;
  });
}

/** The visible text of each body row. */
function bodyRows(html: string): string[] {
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row = ""]) => visibleText(row.replace(/<\/t[dh]>/g, " | </td>")));
}

/** A link's href by its visible text, with &amp; read back. */
function hrefOf(html: string, text: string): string | undefined {
  for (const [, href = "", inner = ""] of html.matchAll(/<a [^>]*?href="([^"]*)"[^>]*>(.*?)<\/a>/gs)) {
    if (visibleText(inner) === text) return href.replace(/&amp;/g, "&");
  }
  return undefined;
}

// Expected figures: docs/data.md, docs/design/README.md and the first and last lines of the file.
describe("the Raw data page (ticket 28)", () => {
  it("is headed Raw data with the data's date; what it shows is in the Orders card's info popover (ticket 30)", async () => {
    const html = await render();
    expect(visibleText(html)).toContain("Data Raw data Data as of 31 Dec 2025 Search");
    expect(visibleText(html)).toContain("Orders 1–50 of 400 Download CSV");
    expect(infoLines(html, "Orders")).toEqual([
      "The 400 orders of mock_logistics_data.csv as the file has them. Read-only: filter, sort and download them.",
      "In file order.",
      "Days in transit: from the order date to 31 Dec 2025, for orders still in transit.",
    ]);
    expect(infoLines(await render({ sort: "order_date" }), "Orders")?.[1]).toBe("Sorted by the marked column.");
  });

  it("keeps each summary figure's definition in its info popover (ticket 30)", async () => {
    const html = await render();
    expect(infoLines(html, "Delivered")).toEqual([METRICS.delivered_orders.definition]);
    expect(infoLines(html, "On-time rate")).toEqual([METRICS.on_time_rate.definition]);
    expect(infoLines(html, "Average delivery time")).toEqual([METRICS.average_delivery_time.definition]);
  });

  it("sums up the orders shown with the KPI definitions: all 400, then FedEx", async () => {
    expect(visibleText(part(await render(), "Summary"))).toBe(
      "Orders 400 of 400 Delivered 370 30 not delivered On-time rate 82.2% 304 / 370 Delay rate 14.9% 55 / 370 Average delivery time 3.8 days over 370 delivered",
    );
    expect(visibleText(part(await render({ carrier: "FedEx" }), "Summary"))).toBe(
      "Orders 89 of 400 Delivered 85 4 not delivered On-time rate 85.9% 73 / 85 Delay rate 12.9% 11 / 85 Average delivery time 3.6 days over 85 delivered",
    );
    expect(visibleText(part(await render({ status: "in_transit" }), "Summary"))).toContain("Delivered 0 27 not delivered On-time rate n/a");
  });

  it("says when a status filter decides the rates, as a question's spec would refuse to measure them (ADR 0006)", async () => {
    const note = "The rates count only the statuses chosen, so the status filter decides them.";
    expect(visibleText(part(await render({ status: "delayed" }), "Summary"))).toContain(`Delay rate 100.0% 55 / 55 Average delivery time 6.1 days over 55 delivered ${note}`);
    expect(visibleText(part(await render({ carrier: "FedEx" }), "Summary"))).not.toContain(note);
  });

  it("shows every column of the file, Order ID first and Delivery days and Days in transit after the dates, each value formatted only for reading", async () => {
    const html = await render();
    expect(headings(html)).toEqual([
      "Order ID",
      "Client",
      "Order date",
      "Delivery date",
      "Delivery days",
      "Days in transit",
      "Carrier",
      "Origin",
      "Destination",
      "Status",
      "SKU",
      "Category",
      "Quantity",
      "Unit price",
      "Order value",
      "Promo",
      "Discount",
      "Region",
      "Warehouse",
    ]);
    // The file's first line: CL-1023,ORD-2026-267300-0001,2025-10-19,2025-10-22,DHL,"London, UK","Leeds, UK",delivered,PAPER-0197,PAPER,2,13.11,26.22,0,0,UK,LON-FC1
    expect(bodyRows(html)[0]).toBe(
      "ORD-2026-267300-0001 | CL-1023 | 19 Oct 2025 | 22 Oct 2025 | 3 | | DHL | London, UK | Leeds, UK | Delivered | PAPER-0197 | PAPER | 2 | $13.11 | $26.22 | No | 0% | UK | LON-FC1 |",
    );
    // Each Order ID names its row.
    expect(html).toContain('<th scope="row"');
    expect(bodyRows(html)).toHaveLength(50);
  });

  it("leaves the delivery date and days empty for an order not delivered, and shows a promo's discount", async () => {
    const [inTransit] = bodyRows(await render({ status: "in_transit" }));
    // Ordered 13 Nov 2025 and still in transit: 48 days old on 31 Dec 2025 (ticket 32).
    expect(inTransit).toMatch(/^ORD-2026-571946-0024 \| CL-1022 \| 13 Nov 2025 \| \| \| 48 \| UPS \| /);
    expect(inTransit).toContain("| In transit |");
    const [promo] = bodyRows(await render({ promo: "yes" }));
    expect(promo).toMatch(/^ORD-2026-981522-0012 .*\| \$47\.95 \| Yes \| 17% \|/);
  });

  it("opens the orders in transit oldest first, with their transit age, as Needs attention's View all links (ticket 32)", async () => {
    const html = await render({ status: "in_transit", sort: "order_date" });
    expect(headings(html)).toContain("Order date ↑ (ascending)");
    const rows = bodyRows(html);
    expect(rows).toHaveLength(27);
    expect(rows[0]).toMatch(/^ORD-2026-182650-0096 \| CL-1006 \| 3 Jan 2025 \| \| \| 362 \| DHL \| /);
    expect(rows.at(-1)).toMatch(/^ORD-2026-328876-0262 .*\| 8 \| UPS \| /);
    expect(hrefOf(html, "Days in transit")).toBe("/data?status=in_transit&sort=age");
  });

  it("pages 50 orders at a time, with the page in the URL", async () => {
    const second = await render({ page: "2" });
    const paging = part(second, "Pages of orders", "</nav>");
    expect(visibleText(paging)).toBe("Previous 51–100 of 400 Next");
    expect(hrefOf(paging, "Previous")).toBe("/data");
    expect(hrefOf(paging, "Next")).toBe("/data?page=3");
    expect(bodyRows(second)[0]).toMatch(/^ORD-2026-393647-0051 /);
    const last = part(await render({ carrier: "FedEx", page: "2" }), "Pages of orders", "</nav>");
    expect(visibleText(last)).toBe("Previous 51–89 of 89 Next");
    expect(hrefOf(last, "Next")).toBeUndefined();
    expect(hrefOf(last, "Previous")).toBe("/data?carrier=FedEx");
  });

  it("sorts by a heading: a click sorts by it, a second reverses it, filters kept and back to page 1", async () => {
    const unsorted = await render({ carrier: "FedEx", page: "2" });
    expect(headings(unsorted).filter((heading) => heading.includes("("))).toEqual([]);
    expect(hrefOf(unsorted, "Order date")).toBe("/data?carrier=FedEx&sort=order_date");
    const ascending = await render({ carrier: "FedEx", sort: "order_date" });
    expect(headings(ascending)).toContain("Order date ↑ (ascending)");
    expect(hrefOf(ascending, "Order date ↑")).toBe("/data?carrier=FedEx&sort=order_date&dir=desc");
    const descending = await render({ sort: "delivery_days", dir: "desc" });
    expect(headings(descending)).toContain("Delivery days ↓ (descending)");
    expect(hrefOf(descending, "Delivery days ↓")).toBe("/data?sort=delivery_days");
    expect(bodyRows(descending)[0]).toContain("| 12 |");
  });

  it("filters with a GET form named as the URL is, so it works without script", async () => {
    const html = await render({ status: ["delayed", "exception"], q: "Leeds" });
    const form = part(html, "Filter orders", "</form>");
    expect(html).toMatch(/<form[^>]*action="\/data"[^>]*method="get"|<form[^>]*method="get"[^>]*action="\/data"/);
    expect(checkboxes(form).filter(({ checked }) => checked).map(({ field }) => field)).toEqual(["status=delayed", "status=exception"]);
    expect(form).toMatch(/<input[^>]*name="q"[^>]*value="Leeds"/);
    // The lists offer the query spec's values: 5 statuses, 9 carriers, 5 regions, 9 warehouses, 8 categories.
    const fields = checkboxes(form).map(({ field }) => field.split("=")[0]);
    for (const [name, count] of [["status", 5], ["carrier", 9], ["region", 5], ["warehouse", 9], ["category", 8]] as const) {
      expect(fields.filter((field) => field === name), name).toHaveLength(count);
    }
    expect(checkboxes(form).slice(0, 5).map(({ field }) => field)).toEqual([
      "status=delivered",
      "status=delayed",
      "status=in_transit",
      "status=exception",
      "status=canceled",
    ]);
  });

  it("shows each active filter as a chip that removes it, and Clear all", async () => {
    const html = await render({ status: "delayed", carrier: "FedEx", date: "delivery", from: "2025-03", to: "2025-06" });
    const chips = part(html, "Active filters", "</ul>");
    expect(visibleText(chips)).toBe("Status: Delayed × Carrier: FedEx × Delivery date: Mar–Jun 2025 × Clear all");
    expect(hrefOf(chips, "Status: Delayed ×")).toBe("/data?carrier=FedEx&date=delivery&from=2025-03&to=2025-06");
    expect(hrefOf(chips, "Delivery date: Mar–Jun 2025 ×")).toBe("/data?status=delayed&carrier=FedEx&date=delivery");
    expect(hrefOf(chips, "Clear all")).toBe("/data");
    expect(await render()).not.toContain('aria-label="Active filters"');
  });

  it("names a parameter it does not support, or a value it does not know, and leaves it out", async () => {
    const html = await render({ origin: "Berlin", carrier: ["FedEx", "Foo"] });
    const note = visibleText(part(html, "Not applied", "</div>"));
    expect(note).toMatch(/origin ?: not a filter on this page/);
    expect(note).toMatch(/carrier=Foo ?: Unknown carrier "Foo"\./);
    expect(visibleText(part(html, "Summary"))).toContain("Orders 89 of 400");
    expect(await render()).not.toContain('aria-label="Not applied"');
  });

  it("downloads the orders shown as CSV, across all pages", async () => {
    expect(hrefOf(await render(), "Download CSV")).toBe("/api/orders.csv");
    expect(hrefOf(await render({ status: "delayed", sort: "order_date", page: "2" }), "Download CSV")).toBe("/api/orders.csv?status=delayed&sort=order_date");
  });

  it('says "No orders match these filters" when none do, with Clear all', async () => {
    const html = await render({ q: "no such order", sort: "carrier" });
    expect(visibleText(html)).toContain("No orders match these filters. Clear all");
    expect(hrefOf(part(html, "orders-title"), "Clear all")).toBe("/data?sort=carrier");
    expect(html).not.toContain("<table");
  });
});
