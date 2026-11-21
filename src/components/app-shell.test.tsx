import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { AppShell } from "./app-shell";
import { Rail } from "./rail";
import { NavLinks } from "./rail-nav";

const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Each menu link's text, and whether it is marked as the current page. */
function links(html: string): [string, boolean][] {
  return [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map((match) => [text(match[2] ?? ""), (match[1] ?? "").includes('aria-current="page"')]);
}

describe("the rail's menu (ADR 0011 §5, ticket 24)", () => {
  it("lists the six pages, Raw data after Forecast, marking the current one for assistive technology (tickets 25, 28)", () => {
    expect(links(renderToStaticMarkup(<NavLinks pathname="/" />))).toEqual([
      ["Overview", true],
      ["Ask the data", false],
      ["Delivery", false],
      ["Carriers", false],
      ["Forecast", false],
      ["Raw data", false],
    ]);
    expect(links(renderToStaticMarkup(<NavLinks pathname="/carriers" />)).filter(([, current]) => current)).toEqual([["Carriers", true]]);
    expect(links(renderToStaticMarkup(<NavLinks pathname="/data" />)).filter(([, current]) => current)).toEqual([["Raw data", true]]);
  });
});

/** The toggle's accessible name and its ARIA state. */
function toggle(html: string): { name?: string; expanded?: string; controls?: string } {
  const attributes = /<button\b([^>]*)>/.exec(html)?.[1] ?? "";
  const attribute = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1];
  return { name: attribute("aria-label"), expanded: attribute("aria-expanded"), controls: attribute("aria-controls") };
}

describe("the rail, collapsed and expanded (ticket 27)", () => {
  const rail = (initiallyCollapsed: boolean) =>
    renderToStaticMarkup(
      <Rail initiallyCollapsed={initiallyCollapsed} brand={<span>Logistics Analytics</span>} dataCard={<p>Data</p>}>
        <NavLinks pathname="/delivery" />
      </Rail>,
    );

  it("collapsed, keeps each page's name as its link's accessible name and still marks the current page", () => {
    const html = rail(true);
    expect(html).toMatch(/<header[^>]*data-rail-collapsed/);
    expect(links(html)).toEqual([
      ["Overview", false],
      ["Ask the data", false],
      ["Delivery", true],
      ["Carriers", false],
      ["Forecast", false],
      ["Raw data", false],
    ]);
    // The names are hidden visually when collapsed, never from assistive technology.
    const linkMarkup = [...html.matchAll(/<a\b[^>]*>(.*?)<\/a>/gs)].map((match) => match[1] ?? "");
    expect(linkMarkup.filter((markup) => /aria-hidden="true"[^>]*>[^<]+</.test(markup))).toEqual([]);
  });

  it("has a toggle that says what it will do and which element it controls", () => {
    expect(toggle(rail(false))).toEqual({ name: "Collapse menu", expanded: "true", controls: "rail" });
    expect(toggle(rail(true))).toEqual({ name: "Expand menu", expanded: "false", controls: "rail" });
    expect(rail(false)).toMatch(/<header[^>]*id="rail"/);
    expect(rail(false)).not.toContain("data-rail-collapsed");
  });
});

describe("the shell around every page", () => {
  const html = renderToStaticMarkup(
    <AppShell dataset={getDataset()} modelName="Gemma 4 12B" railCollapsed={false}>
      <p>Page content</p>
    </AppShell>,
  );

  it("draws the rail as the viewer last left it, so a reload keeps the choice (ticket 27)", () => {
    const collapsed = renderToStaticMarkup(
      <AppShell dataset={getDataset()} modelName="Gemma 4 12B" railCollapsed>
        <p>Page content</p>
      </AppShell>,
    );
    expect(toggle(collapsed).name).toBe("Expand menu");
    expect(collapsed).toMatch(/<header[^>]*data-rail-collapsed/);
    expect(toggle(html).name).toBe("Collapse menu");
  });

  it("opens with a link that skips to the content", () => {
    expect(html.indexOf('href="#content"')).toBeLessThan(html.indexOf("Logistics Analytics"));
    expect(html).toMatch(/<main[^>]*id="content"/);
    expect(text(html)).toContain("Skip to content");
  });

  it("names the product and the data it reads, computed from the dataset", () => {
    expect(text(html)).toContain("Logistics Analytics Order data, 2025");
    expect(text(html)).toMatch(/Data mock_logistics_data\.csv (mock_logistics_data\.csv )?400 orders · 1 Jan–31 Dec 2025 · read-only/);
    expect(text(html)).toContain("Gemma 4 12B on this server.");
  });

  it("links the data file's name to the orders in Raw data (ticket 28)", () => {
    expect(html).toMatch(/<a [^>]*href="\/data"[^>]*>mock_logistics_data\.csv<\/a>/);
  });
});
