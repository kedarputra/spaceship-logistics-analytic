import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { infoLines, visibleText } from "@/components/markup-text";
import { GROSS_VALUE_NOTE } from "@/components/gross-value";
import { InventoryPage } from "./inventory-page";

// Golden numbers: ticket 33, recomputed from data/mock_logistics_data.csv.
const html = renderToStaticMarkup(<InventoryPage />);

/** The markup inside a named part (aria-label or aria-labelledby), up to `end`. */
function part(name: string, end = "</section>"): string {
  const start = html.search(new RegExp(`aria-label(?:ledby)?="${name}"`));
  if (start === -1) throw new Error(`no part ${name}`);
  return html.slice(html.indexOf(">", start) + 1, html.indexOf(end, start));
}

/** The visible text of each body row, cells split by " | ". */
function bodyRows(markup: string): string[] {
  const body = markup.slice(markup.indexOf("<tbody"), markup.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(([, row = ""]) => visibleText(row.replace(/<\/t[dh]>/g, " | </td>")).trim());
}

function footRow(markup: string): string {
  const foot = markup.slice(markup.indexOf("<tfoot"), markup.indexOf("</tfoot>"));
  return visibleText(foot.replace(/<\/t[dh]>/g, " | </td>")).trim();
}

/** Every link as [accessible name, href], &amp; read back. */
function links(markup: string): [string, string][] {
  return [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].map(([, attributes = "", inner = ""]) => [
    /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? visibleText(inner).trim(),
    (/href="([^"]*)"/.exec(attributes)?.[1] ?? "").replace(/&amp;/g, "&"),
  ]);
}

describe("the Inventory page (ticket 33)", () => {
  it("is headed Inventory with the data's date, and no sentence under it", () => {
    expect(visibleText(html)).toContain("Inventory Inventory Data as of 31 Dec 2025 Class A");
  });

  it("shows the three ABC classes as tiles: SKUs, gross value and share of value", () => {
    expect(visibleText(part("ABC classes")).trim()).toBe(
      [
        "Class A 174 SKUs $10,961.89 · 80.0% of value",
        "Class B 103 SKUs $2,054.36 · 15.0% of value",
        "Class C 78 SKUs $679.62 · 5.0% of value",
        "The catalogue is flat: 174 of 355 SKUs (49.0%) make 80% of the value.",
      ].join(" "),
    );
  });

  it("marks each class with its letter beside its colour, never the colour alone", () => {
    const tiles = part("ABC classes");
    for (const [letter, fill] of [["A", "bg-mark-on-time"], ["B", "bg-mark-delayed"], ["C", "bg-mark-exception"]]) {
      expect(tiles).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*${fill}[^"]*"></span>Class ${letter}<`));
    }
  });

  it("says in each class's info popover which SKUs it holds, and that the value is gross", () => {
    expect(infoLines(html, "Class A")).toEqual([
      "The SKUs ranked while the value before them is under 80% of all value.",
      "SKUs are ranked by gross value, highest first; ties by SKU.",
      GROSS_VALUE_NOTE,
    ]);
    expect(infoLines(html, "Class B")?.[0]).toBe("The SKUs ranked while the value before them is from 80% to under 95%.");
    expect(infoLines(html, "Class C")?.[0]).toBe("The SKUs ranked after 95% of all value.");
    expect(GROSS_VALUE_NOTE).toBe("Value is gross: order value as given, before promo discounts.");
  });

  it("draws the Pareto curve with the classes and their limits in its legend, and every SKU in its Data table", () => {
    const chart = part("pareto-title", "</figure>");
    expect(visibleText(chart)).toContain("Cumulative share of value Data table A 174 SKUs B 103 SKUs C 78 SKUs Class limits, 80% and 95%");
    const rows = bodyRows(chart);
    expect(rows).toHaveLength(355);
    expect(rows[0]).toBe("1 | MARKER-0138 | A | $345.49 | 2.5% |");
    // The last A and the first B: the limit at 80% falls between them.
    expect(rows[173]).toMatch(/^174 \| [A-Z]+-\d{4} \| A \| /);
    expect(rows[174]).toMatch(/^175 \| [A-Z]+-\d{4} \| B \| /);
    expect(rows.at(-1)).toMatch(/^355 \| .* \| C \| .* \| 100\.0% \|$/);
    expect(infoLines(html, "Cumulative share of value")).toContain(GROSS_VALUE_NOTE);
  });

  it("lists the top 10 SKUs by gross value, with class, category, orders and units", () => {
    const table = part("top-skus-title");
    expect(visibleText(table)).toContain("Top 10 SKUs by value SKU Class Category Orders Units Gross value ↓");
    expect(bodyRows(table)).toEqual([
      "MARKER-0138 | A | MARKER | 2 | 16 | $345.49 |",
      "PAINT-0037 | A | PAINT | 1 | 11 | $298.87 |",
      "MARKER-0047 | A | MARKER | 2 | 11 | $204.76 |",
      "PAPER-0041 | A | PAPER | 2 | 17 | $193.77 |",
      "PAPER-0075 | A | PAPER | 2 | 17 | $177.42 |",
      "BOOK-0040 | A | BOOK | 1 | 9 | $168.03 |",
      "PAINT-0122 | A | PAINT | 1 | 6 | $166.14 |",
      "BOOK-0072 | A | BOOK | 1 | 10 | $165.70 |",
      "PAINT-0176 | A | PAINT | 1 | 7 | $158.83 |",
      "BOOK-0117 | A | BOOK | 1 | 7 | $154.98 |",
    ]);
    expect(infoLines(html, "Top 10 SKUs by value")).toContain(GROSS_VALUE_NOTE);
  });

  it("opens each top SKU's orders in Raw data", () => {
    const skuLinks = links(part("top-skus-title"));
    expect(skuLinks).toHaveLength(10);
    expect(skuLinks[0]).toEqual(["MARKER-0138: view the 2 orders", "/data?sku=MARKER-0138"]);
    expect(skuLinks[1]).toEqual(["PAINT-0037: view the 1 order", "/data?sku=PAINT-0037"]);
  });

  it("lists the categories by gross value, with orders, units and share of value, and a total", () => {
    const table = part("categories-title");
    expect(bodyRows(table)).toEqual([
      "PAINT | 49 | 105 | $2,288.10 | 16.7% | Forecast |",
      "PAPER | 43 | 196 | $2,023.30 | 14.8% | Forecast |",
      "BRUSH | 49 | 169 | $1,903.85 | 13.9% | Forecast |",
      "MARKER | 51 | 122 | $1,873.70 | 13.7% | Forecast |",
      "CRAYON | 69 | 229 | $1,841.30 | 13.4% | Forecast |",
      "BOOK | 42 | 95 | $1,649.84 | 12.0% | Forecast |",
      "STICKER | 52 | 222 | $1,164.99 | 8.5% | Forecast |",
      "PENCIL | 45 | 172 | $950.79 | 6.9% | Forecast |",
    ]);
    expect(footRow(table)).toBe("All categories | 400 | 1,310 | $13,695.87 | 100.0% | |");
    expect(infoLines(html, "Categories")).toContain(GROSS_VALUE_NOTE);
  });

  it("opens each category's orders in Raw data and its forecast", () => {
    const categoryLinks = links(part("categories-title"));
    expect(categoryLinks.slice(0, 2)).toEqual([
      ["PAINT: view the 49 orders", "/data?category=PAINT"],
      ["PAINT: view the forecast", "/forecast?scope=category&value=PAINT"],
    ]);
    expect(categoryLinks).toHaveLength(16);
  });
});
