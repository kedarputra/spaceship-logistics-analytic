import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { AppShell } from "./app-shell";
import { NavLinks } from "./rail-nav";

const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Each menu link's text, and whether it is marked as the current page. */
function links(html: string): [string, boolean][] {
  return [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map((match) => [text(match[2] ?? ""), (match[1] ?? "").includes('aria-current="page"')]);
}

describe("the rail's menu (ADR 0011 §5, ticket 24)", () => {
  it("lists Overview and Ask, marking the current page for assistive technology", () => {
    expect(links(renderToStaticMarkup(<NavLinks pathname="/" />))).toEqual([
      ["Overview", true],
      ["Ask the data", false],
    ]);
    expect(links(renderToStaticMarkup(<NavLinks pathname="/ask" />))).toEqual([
      ["Overview", false],
      ["Ask the data", true],
    ]);
  });
});

describe("the shell around every page", () => {
  const html = renderToStaticMarkup(
    <AppShell dataset={getDataset()}>
      <p>Page content</p>
    </AppShell>,
  );

  it("opens with a link that skips to the content", () => {
    expect(html.indexOf('href="#content"')).toBeLessThan(html.indexOf("Logistics Analytics"));
    expect(html).toMatch(/<main[^>]*id="content"/);
    expect(text(html)).toContain("Skip to content");
  });

  it("names the product and the data it reads, computed from the dataset", () => {
    expect(text(html)).toContain("Logistics Analytics Order data, 2025");
    expect(text(html)).toContain("Data mock_logistics_data.csv 400 orders · 1 Jan–31 Dec 2025 · read-only");
  });
});
