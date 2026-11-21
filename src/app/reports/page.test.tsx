import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Role } from "@/auth/roles";
import { Icon } from "@/components/icons";
import { infoLines, visibleText as readerText } from "@/components/markup-text";
import { ReportsPage } from "./reports-page";

// Golden numbers: ticket 34, recomputed from data/mock_logistics_data.csv.
const render = async (params: Record<string, string> = {}, role: Role = "analyst") =>
  renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(params), role }));

const LOCK = renderToStaticMarkup(<Icon name="lock" size={15} />);

function visibleText(html: string): string {
  return readerText(html).replace(/\s+/g, " ").trim();
}

/** The markup inside a named part (aria-label or aria-labelledby), up to the end of its section. */
function part(html: string, name: string): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return html.slice(html.indexOf(">", start) + 1, html.indexOf("</section>", start));
}

/** The visible text of each body row, cells split by " | ". */
function bodyRows(markup: string): string[] {
  const body = markup.slice(markup.indexOf("<tbody"), markup.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row = ""]) => readerText(row.replace(/<\/t[dh]>/g, " | </td>")).replace(/\s+/g, " ").trim());
}

/** Every link as [visible text, href]. */
function links(markup: string): [string, string][] {
  return [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].map(([, attributes = "", inner = ""]) => [readerText(inner).trim(), /href="([^"]*)"/.exec(attributes)?.[1] ?? ""]);
}

describe("the Reports page (ticket 34)", async () => {
  const november = await render({ month: "2025-11" });

  it("is headed Reports with the data's date, and no sentence under it", () => {
    expect(visibleText(november)).toMatch(/^Reports Reports Data as of 31 Dec 2025 Month /);
  });

  it("opens on the anchor's month, Dec 2025, and reads an unknown month as it", async () => {
    for (const html of [await render(), await render({ month: "2024-12" }), await render({ month: "nov" })]) {
      expect(html).toMatch(/<option value="2025-12" selected="">Dec 2025<\/option>/);
      expect(visibleText(part(html, "placed-title"))).toContain("Dec 2025 · by order date");
    }
  });

  it("picks any month of the data: Jan to Dec 2025, as a GET form on /reports", () => {
    const options = [...november.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(([, value, label]) => `${value} ${label}`);
    expect(options).toHaveLength(12);
    expect(options[0]).toBe("2025-01 Jan 2025");
    expect(options[11]).toBe("2025-12 Dec 2025");
    expect(november).toMatch(/<option value="2025-11" selected="">Nov 2025<\/option>/);
    expect(november).toMatch(/<form [^>]*action="\/reports" method="get"/);
  });

  it("gives Nov's orders placed and deliveries completed beside Oct's, each section's basis in its header", () => {
    expect(visibleText(part(november, "placed-title"))).toMatch(/^Orders placed Nov 2025 · by order date /);
    expect(bodyRows(part(november, "placed-title"))).toEqual(["Orders | 24 | 26 | −2 |", "Units | 113 | 79 | +34 |", "Gross value | $1,600.98 | $912.02 | +$688.96 |"]);
    expect(visibleText(part(november, "completed-title"))).toMatch(/^Deliveries completed Nov 2025 · by delivery date /);
    expect(bodyRows(part(november, "completed-title"))).toEqual([
      "Delivered orders | 19 | 22 | −3 |",
      "On-time rate | 84.2% · 16 of 19 | 81.8% · 18 of 22 | +2.4 points |",
      "Delay rate | 15.8% · 3 of 19 | 13.6% · 3 of 22 | +2.2 points |",
      "Avg delivery time | 3.7 days | 3.3 days | +0.4 days |",
    ]);
    expect(infoLines(november, "Deliveries completed")).toContain("A rate's change is in percentage points.");
  });

  it("splits the deliveries by outcome with their rates, and charts them per week in the same card, with a data table", () => {
    const outcomes = part(november, "outcomes-title");
    expect(bodyRows(outcomes.slice(0, outcomes.indexOf("weeks-title")))).toEqual(["On time | 16 | 84.2% | 18 |", "Delayed | 3 | 15.8% | 3 |", "Exception | 0 | 0.0% | 1 |"]);
    expect(visibleText(outcomes)).toContain("Per week of delivery Data table Week On time Delayed Exception Delivered w/c 27 Oct 1 0 0 1 w/c 3 Nov 3 1 0 4");
    expect(infoLines(november, "Delivery outcomes")).toContain("Weeks run Monday to Sunday. w/c 27 Oct: 1–2 Nov only.");
  });

  it("lists the carriers and warehouses with the small-sample tag, and the top categories and SKUs", () => {
    expect(bodyRows(part(november, "carriers-title"))[0]).toBe("USPS small sample | 5 | 3 | 2 | 60.0% |");
    expect(bodyRows(part(november, "carriers-title"))).toHaveLength(8);
    expect(bodyRows(part(november, "warehouses-title"))).toContain("EWR-DC1 small sample | 8 | 45 | $833.57 | 7 | 100.0% | 0.0% | 3.0 days |");
    expect(bodyRows(part(november, "categories-title")).slice(0, 3)).toEqual([
      "PAINT | 4 | 17 | $406.92 | 25.4% |",
      "MARKER | 3 | 15 | $285.69 | 17.8% |",
      "PAPER | 3 | 22 | $272.44 | 17.0% |",
    ]);
    expect(bodyRows(part(november, "skus-title"))[0]).toBe("PAINT-0037 | PAINT | 1 | 11 | $298.87 |");
  });

  it("says the orders that need attention are still in transit on the anchor date, not at the month's end", () => {
    const attention = part(november, "attention-title");
    expect(visibleText(attention)).toMatch(/^Needs attention Placed in Nov 2025 · still in transit on 31 Dec 2025, or canceled /);
    expect(bodyRows(attention)[0]).toBe("ORD-2026-542610-0082 | 3 Nov 2025 | DHL | DFW-DC1 | In transit | 58 |");
    expect(infoLines(november, "Needs attention")?.[0]).toBe("Status is as of 31 Dec 2025, the data's last day: the data cannot say what was in transit at the end of Nov 2025.");
  });

  it("says so when no order of the month needs attention", async () => {
    // In the file, no order placed in Jun 2025 is in transit or canceled.
    expect(visibleText(part(await render({ month: "2025-06" }), "attention-title"))).toContain("No order placed in Jun 2025 is still in transit or canceled.");
  });
});

describe("the Reports page's exports and import, by role (ticket 34)", () => {
  it("gives an analyst the month's PDF and CSV and every order as CSV, and no import", async () => {
    const exports = part(await render({ month: "2025-11" }), "Export");
    expect(links(exports)).toEqual([
      ["Monthly report (PDF)", "/api/reports/2025-11.pdf"],
      ["Monthly report (CSV)", "/api/reports/2025-11.csv"],
      ["All orders (CSV)", "/api/orders.csv"],
    ]);
    expect(exports).not.toContain("/import");
    expect(visibleText(exports)).not.toContain("Analyst role needed");
  });

  it("shows a viewer the same three, disabled with a lock and “Analyst role needed”, and links to none", async () => {
    const exports = part(await render({ month: "2025-11" }, "viewer"), "Export");
    expect(links(exports)).toEqual([]);
    const buttons = [...exports.matchAll(/<button([^>]*)>(.*?)<\/button>/gs)].map(([, attributes = "", inner = ""]) => ({
      text: readerText(inner).trim(),
      disabled: /\bdisabled=""/.test(attributes),
      lock: inner.includes(LOCK),
    }));
    expect(buttons).toEqual(
      ["Monthly report (PDF)", "Monthly report (CSV)", "All orders (CSV)"].map((text) => ({ text, disabled: true, lock: true })),
    );
    expect(visibleText(exports)).toContain("Analyst role needed");
  });

  it("gives an admin the link to import data too", async () => {
    expect(links(part(await render({ month: "2025-11" }, "admin"), "Export"))).toContainEqual(["Import data", "/import"]);
  });
});
