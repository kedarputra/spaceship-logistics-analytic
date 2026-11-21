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
  it("lists the seven pages an analyst can open, Needs attention under Overview and Raw data after Forecast, marking the current one for assistive technology (tickets 25, 28, 32)", () => {
    expect(links(renderToStaticMarkup(<NavLinks pathname="/" role="analyst" />))).toEqual([
      ["Overview", true],
      ["Needs attention", false],
      ["Ask the data", false],
      ["Delivery", false],
      ["Carriers", false],
      ["Forecast", false],
      ["Raw data", false],
    ]);
    expect(links(renderToStaticMarkup(<NavLinks pathname="/carriers" role="analyst" />)).filter(([, current]) => current)).toEqual([["Carriers", true]]);
    expect(links(renderToStaticMarkup(<NavLinks pathname="/data" role="analyst" />)).filter(([, current]) => current)).toEqual([["Raw data", true]]);
  });

  it("lists only the pages the role can open: no Ask for a viewer, and Users for an admin (ticket 31)", () => {
    const names = (role: "viewer" | "analyst" | "admin") => links(renderToStaticMarkup(<NavLinks pathname="/" role={role} />)).map(([name]) => name);
    expect(names("viewer")).toEqual(["Overview", "Needs attention", "Delivery", "Carriers", "Forecast", "Raw data"]);
    expect(names("analyst")).toEqual(["Overview", "Needs attention", "Ask the data", "Delivery", "Carriers", "Forecast", "Raw data"]);
    expect(names("admin")).toEqual(["Overview", "Needs attention", "Ask the data", "Delivery", "Carriers", "Forecast", "Raw data", "Users"]);
  });

  it("badges Needs attention with its count, named for assistive technology and kept in the collapsed rail's tooltip (ticket 32)", () => {
    const html = renderToStaticMarkup(<NavLinks pathname="/" role="viewer" overdue={26} />);
    expect(links(html)[1]).toEqual(["Needs attention 26 overdue", false]);
    expect(html).toContain('data-tip="Needs attention · 26 overdue"');
    // No badge for a count of 0.
    expect(links(renderToStaticMarkup(<NavLinks pathname="/" role="viewer" overdue={0} />))[1]).toEqual(["Needs attention", false]);
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
        <NavLinks pathname="/delivery" role="analyst" />
      </Rail>,
    );

  it("collapsed, keeps each page's name as its link's accessible name and still marks the current page", () => {
    const html = rail(true);
    expect(html).toMatch(/<header[^>]*data-rail-collapsed/);
    expect(links(html)).toEqual([
      ["Overview", false],
      ["Needs attention", false],
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
    <AppShell user={{ username: "dina", role: "analyst" }} dataset={getDataset()} modelName="Gemma 4 12B" railCollapsed={false}>
      <p>Page content</p>
    </AppShell>,
  );

  it("draws the rail as the viewer last left it, so a reload keeps the choice (ticket 27)", () => {
    const collapsed = renderToStaticMarkup(
      <AppShell user={{ username: "dina", role: "analyst" }} dataset={getDataset()} modelName="Gemma 4 12B" railCollapsed>
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

  it("badges Needs attention with the orders overdue in transit, computed from the dataset (ticket 32)", () => {
    expect(text(html)).toContain("Overview Needs attention 26 overdue Ask the data");
  });

  it("links the data file's name to the orders in Raw data (ticket 28)", () => {
    expect(html).toMatch(/<a [^>]*href="\/data"[^>]*>mock_logistics_data\.csv<\/a>/);
  });

  it("ends the rail with the username, a role chip and Sign out, a POST to /api/logout (ticket 31)", () => {
    expect(text(html)).toMatch(/read-only .* dina Analyst Sign out Page content$/);
    const form = /<form([^>]*)><button type="submit"[^>]*data-tip="Sign out"/.exec(html)?.[1] ?? "";
    expect(form).toContain('action="/api/logout"');
    expect(form).toContain('method="post"');
    // Collapsed, the account's icon names who it is.
    expect(html).toContain('data-tip="dina · Analyst"');
  });
});
