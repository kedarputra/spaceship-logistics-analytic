import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buckets } from "@/domain/periods";
import { OrderBars } from "./month-charts";

describe("a month with no orders opens nothing (ticket 26)", () => {
  // Two months that are not in the data: 3 orders in Jan 2025, none in Feb.
  const [january, february] = buckets({ from: "2025-01-01", to: "2025-02-28" }, "month");
  if (january === undefined || february === undefined) throw new Error("no months");
  const html = renderToStaticMarkup(
    <OrderBars
      months={[
        { bucket: january, value: 3 },
        { bucket: february, value: 0 },
      ]}
    />,
  );

  it("links a month with orders to them", () => {
    const link = /<a [^>]*>/.exec(html)?.[0] ?? "";
    expect(link).toContain('href="/data?from=2025-01&amp;to=2025-01"');
    expect(link).toContain('aria-label="Jan 2025: 3 orders. View the 3 orders"');
  });

  it("draws a month with none as a plain slot: no link, nothing to view", () => {
    expect([...html.matchAll(/<a /g)]).toHaveLength(1);
    expect(html).toMatch(/<div data-month="1"/);
    expect(html).not.toContain("View the 0");
  });
});
