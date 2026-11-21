import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { infoLines, visibleText } from "@/components/markup-text";
import { readOrdersView } from "@/components/orders-url";
import { METRICS } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import { ordersInView } from "@/tools/orders-view";
import { AttentionPage } from "./attention-page";

// Golden numbers: ticket 32, recomputed from data/mock_logistics_data.csv, and docs/design/README.md.
const html = renderToStaticMarkup(<AttentionPage />);

const SECTIONS = ["overdue", "exceptions", "delayed", "canceled"] as const;

/** The markup of one section, by its id. */
function section(id: (typeof SECTIONS)[number]): string {
  const start = html.search(new RegExp(`aria-labelledby="${id}-title"`));
  if (start === -1) throw new Error(`no section ${id}`);
  return html.slice(html.indexOf(">", start) + 1, html.indexOf("</section>", start));
}

/** The visible text of each body row, cells split by " | ". */
function bodyRows(markup: string): string[] {
  const body = markup.slice(markup.indexOf("<tbody"), markup.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row = ""]) => visibleText(row.replace(/<\/t[dh]>/g, " | </td>")).trim());
}

/** Each column heading's text. */
function headings(markup: string): string[] {
  return [...markup.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/gs)].map(([, inner = ""]) => visibleText(inner).trim());
}

/** Every link as [visible text, href], &amp; read back. */
function links(markup: string): [string, string][] {
  return [...markup.matchAll(/<a [^>]*?href="([^"]*)"[^>]*>(.*?)<\/a>/gs)].map(([, href = "", inner = ""]) => [visibleText(inner).trim(), href.replace(/&amp;/g, "&")]);
}

describe("the Needs attention page (ticket 32)", () => {
  it("is headed Needs attention with the data's date, and no sentence under it", () => {
    expect(visibleText(html)).toContain("Worklist Needs attention Data as of 31 Dec 2025 Overdue in transit");
  });

  it("has four sections, each a title, a count and a table: overdue in transit 26, exceptions 11, delayed 55, canceled 3", () => {
    expect(SECTIONS.map((id) => visibleText(section(id)).trim().split(" By carrier")[0])).toEqual([
      "Overdue in transit 26 of 27 in transit Days in transit 0–7 days 0 8–14 days 1 15–30 days 0 31+ days 26 1 more in transit, within 12 days",
      "Exceptions 11",
      "Delayed 55",
      "Canceled 3",
    ]);
  });

  it("shows each section's count per carrier, so a reader sees whom to call", () => {
    const byCarrier = (id: (typeof SECTIONS)[number]) => /By carrier (.*?) Order ID/.exec(visibleText(section(id)))?.[1];
    expect(byCarrier("overdue")).toBe("UPS 7 DHL 5 FedEx 4 DPD 2 LaserShip 2 OnTrac 2 USPS 2 GLS 1 Royal Mail 1");
    expect(byCarrier("exceptions")).toBe("DPD 2 OnTrac 2 UPS 2 DHL 1 FedEx 1 GLS 1 Royal Mail 1 USPS 1");
    expect(byCarrier("canceled")).toBe("UPS 2 LaserShip 1");
  });

  it("lists the first 10 of each, oldest first, with the order date and the age or delivery days", () => {
    const overdue = section("overdue");
    expect(headings(overdue)).toEqual(["Order ID", "Client", "Carrier", "Warehouse", "Order date", "Days in transit"]);
    expect(bodyRows(overdue)).toHaveLength(10);
    expect(bodyRows(overdue).slice(0, 2)).toEqual([
      "ORD-2026-182650-0096 | CL-1006 | DHL | SFO-DC2 | 3 Jan 2025 | 362 |",
      "ORD-2026-616202-0285 | CL-1005 | DHL | LON-FC1 | 3 Jan 2025 | 362 |",
    ]);
    const delayed = section("delayed");
    expect(headings(delayed)).toEqual(["Order ID", "Client", "Carrier", "Warehouse", "Order date", "Delivery date", "Delivery days"]);
    expect(bodyRows(delayed)).toHaveLength(10);
    expect(bodyRows(section("exceptions"))).toHaveLength(10);
    const canceled = section("canceled");
    expect(headings(canceled)).toEqual(["Order ID", "Client", "Carrier", "Warehouse", "Order date"]);
    expect(bodyRows(canceled).map((row) => row.split(" | ")[0])).toEqual(["ORD-2026-975697-0193", "ORD-2026-774620-0268", "ORD-2026-375289-0272"]);
  });

  it("links each title and its View all to the same orders in Raw data, oldest first", () => {
    expect(SECTIONS.map((id) => links(section(id)))).toEqual([
      [
        ["Overdue in transit", "/data?status=in_transit&sort=order_date"],
        ["View all 27 in transit", "/data?status=in_transit&sort=order_date"],
      ],
      [
        ["Exceptions", "/data?status=exception&sort=order_date"],
        ["View all 11 exceptions", "/data?status=exception&sort=order_date"],
      ],
      [
        ["Delayed", "/data?status=delayed&sort=order_date"],
        ["View all 55 delayed", "/data?status=delayed&sort=order_date"],
      ],
      [
        ["Canceled", "/data?status=canceled&sort=order_date"],
        ["View all 3 canceled", "/data?status=canceled&sort=order_date"],
      ],
    ]);
  });

  it("shows in each table the first orders its link opens in Raw data, in the same order", () => {
    const { orders } = getDataset();
    for (const id of SECTIONS) {
      const [, href = ""] = links(section(id))[0] ?? [];
      const params = Object.fromEntries(new URL(href, "http://localhost").searchParams);
      const opened = ordersInView(orders, readOrdersView(params, orders).view).map((order) => order.order_id);
      expect(bodyRows(section(id)).map((row) => row.split(" | ")[0]), id).toEqual(opened.slice(0, 10));
    }
  });

  it("keeps each section's definition in its info popover", () => {
    expect(infoLines(html, "Overdue in transit")).toEqual([
      "In transit longer than the longest completed delivery, 12 days: older than any order that ever arrived. The data has no promised date, so this is the threshold.",
      "Days in transit: from the order date to 31 Dec 2025.",
      "Oldest first, by order date.",
    ]);
    expect(infoLines(html, "Exceptions")).toEqual([METRICS.exception_orders.definition, "Oldest first, by order date."]);
    expect(infoLines(html, "Delayed")).toEqual([METRICS.delayed_orders.definition, "Oldest first, by order date."]);
    expect(infoLines(html, "Canceled")).toEqual(["Orders with status canceled: never delivered.", "Oldest first, by order date."]);
  });
});
