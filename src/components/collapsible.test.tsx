import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExplanationCard } from "./answer-parts";
import { ChartCard } from "./chart-card";
import { CollapsibleRegion, disclosure } from "./collapsible";

/** The opening tag of the button whose words include `name`. */
function buttonNamed(html: string, name: string): string {
  return [...html.matchAll(/(<button[^>]*>)(.*?)<\/button>/gs)].find(([, , content = ""]) => content.includes(name))?.[1] ?? "";
}

/** The button's aria-expanded, and whether its region is open (data-open) and closed to readers and focus (inert). */
function stateOf(html: string, name: string) {
  const button = buttonNamed(html, name);
  const id = /aria-controls="([^"]+)"/.exec(button)?.[1] ?? "";
  const region = new RegExp(`<div[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? "";
  return {
    expanded: /aria-expanded="([a-z]+)"/.exec(button)?.[1],
    controls: /aria-controls="([^"]+)"/.exec(button)?.[1],
    open: region.includes("data-open"),
    inert: /\binert=""/.test(region),
  };
}

describe("a collapsible keeps its button and its region in step (ticket 30)", () => {
  it.each([true, false])("open %s: aria-expanded, the region's open state and inert agree", (open) => {
    const { button, region } = disclosure(open, "panel");
    const html = renderToStaticMarkup(
      <>
        <button type="button" {...button}>
          Data table
        </button>
        <CollapsibleRegion {...region}>The table</CollapsibleRegion>
      </>,
    );
    expect(stateOf(html, "Data table")).toEqual({ expanded: String(open), controls: "panel", open, inert: !open });
  });

  it("keeps the content in the page either way, so it can grow from nothing", () => {
    const { region } = disclosure(false, "panel");
    expect(renderToStaticMarkup(<CollapsibleRegion {...region}>The table</CollapsibleRegion>)).toContain("The table");
  });
});

describe("the collapsibles start closed (ticket 30)", () => {
  it("Data table: the button controls the table's region, closed", () => {
    const html = renderToStaticMarkup(
      <ChartCard title="Orders per month" info={["By order date"]} table={{ headers: ["Month", "Orders"], rows: [["Jan 2025", "75"]] }}>
        <p>the chart</p>
      </ChartCard>,
    );
    expect(stateOf(html, "Data table")).toMatchObject({ expanded: "false", open: false, inert: true });
    expect(html).toContain("Jan 2025");
  });

  it("How this was computed: closed, with everything inside its region", () => {
    const html = renderToStaticMarkup(
      <ExplanationCard title="How this was computed">
        <p>The spec</p>
      </ExplanationCard>,
    );
    const { controls } = stateOf(html, "How this was computed");
    expect(stateOf(html, "How this was computed")).toMatchObject({ expanded: "false", open: false, inert: true });
    expect(html.slice(html.indexOf(`id="${controls}"`))).toContain("The spec");
  });
});
