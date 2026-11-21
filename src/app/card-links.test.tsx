import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ordersHref } from "@/components/orders-href";
import { paramsRecord } from "@/components/orders-url";
import { type Answer, answerQuery } from "@/tools/answer";
import { querySpecSchema } from "@/tools/spec";
import CarriersPage from "./carriers/page";
import DataPage from "./data/page";
import DeliveryPage from "./delivery/page";
import ForecastPage from "./forecast/page";
import OverviewPage from "./page";

// Raw data's filter form navigates with Next's router, which only exists inside a running app; the markup is what is under test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

function decoded(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

function visibleText(html: string): string {
  return decoded(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

interface PageLink {
  /** The accessible name: the aria-label, or else the link's text. */
  name: string;
  href: string;
}

function links(html: string): PageLink[] {
  return [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/gs)].map(([, attributes = "", inner = ""]) => ({
    name: decoded(/aria-label="([^"]*)"/.exec(attributes)?.[1] ?? visibleText(inner)),
    href: decoded(/href="([^"]*)"/.exec(attributes)?.[1] ?? ""),
  }));
}

/** The href of the one link with this accessible name. */
function hrefNamed(html: string, name: string): string {
  const named = links(html).filter((link) => link.name === name);
  if (named.length !== 1) throw new Error(`${named.length} links named "${name}"`);
  return named[0]?.href ?? "";
}

/** How many orders Raw data shows at `href`, read from its summary, with nothing in the URL left out. */
async function ordersShown(href: string): Promise<number> {
  const url = new URL(href, "http://localhost");
  expect(url.pathname).toBe("/data");
  const html = renderToStaticMarkup(await DataPage({ searchParams: Promise.resolve(paramsRecord(url.searchParams)) }));
  expect(html).not.toContain('aria-label="Not applied"');
  const summary = visibleText(html.slice(html.indexOf('aria-label="Summary"'), html.indexOf("</section>", html.indexOf('aria-label="Summary"'))));
  const count = /Orders ([\d,]+) of/.exec(summary)?.[1];
  if (count === undefined) throw new Error(`no order count in "${summary}"`);
  return Number(count.replace(/,/g, ""));
}

/** Whether any link holds another link or a button. */
function nestsInteractive(html: string): boolean {
  return [...html.matchAll(/<a [^>]*>(.*?)<\/a>/gs)].some(([, inner = ""]) => /<a |<button/.test(inner));
}

const DELIVERED = "status=delivered&status=delayed&status=exception";

const overview = renderToStaticMarkup(<OverviewPage />);
const delivery = renderToStaticMarkup(<DeliveryPage />);
const carriers = renderToStaticMarkup(<CarriersPage />);
const forecast = renderToStaticMarkup(await ForecastPage({ searchParams: Promise.resolve({}) }));

// Expected figures: the ticket's table and docs/data.md. "Delivered" is status delivered, delayed or exception: the 370.
describe("the Overview's cards open what explains them (ticket 29)", () => {
  it("Total orders opens every order: 400", async () => {
    const href = hrefNamed(overview, "Total orders: view the 400 orders");
    expect(href).toBe("/data");
    expect(await ordersShown(href)).toBe(400);
  });

  it("Delivered orders opens the delivered orders: 370", async () => {
    const href = hrefNamed(overview, "Delivered orders: view the 370 orders");
    expect(href).toBe(`/data?${DELIVERED}`);
    expect(await ordersShown(href)).toBe(370);
  });

  it("Delayed orders opens the delayed orders: 55", async () => {
    const href = hrefNamed(overview, "Delayed orders: view the 55 orders");
    expect(href).toBe("/data?status=delayed");
    expect(await ordersShown(href)).toBe(55);
  });

  it("On-time delivery rate opens the rate by month on the Delivery page", () => {
    expect(hrefNamed(overview, "On-time delivery rate: view the rate by month")).toBe("/delivery#ontime-title");
    expect(delivery).toMatch(/id="ontime-title"[^>]*>On-time delivery rate per month</);
  });

  it("Average delivery time opens the Delivery page at the region and warehouse cards", () => {
    expect(hrefNamed(overview, "Average delivery time: view the times by region and warehouse")).toBe("/delivery#delivery-time-by-place");
    const place = delivery.slice(delivery.indexOf(">", delivery.indexOf('id="delivery-time-by-place"')) + 1);
    expect(visibleText(place)).toMatch(/^Average delivery time by region .* Average delivery time by warehouse/);
  });

  it("a carrier bar opens that carrier's delayed orders, as on the Carriers page: GLS 2", async () => {
    // docs/data.md: GLS 2/8.
    const href = hrefNamed(overview, "GLS: view the 2 delayed orders");
    expect(href).toBe("/data?status=delayed&carrier=GLS");
    expect(await ordersShown(href)).toBe(2);
  });

  it("shows each card's link on its foot, so it is found on touch", () => {
    const text = visibleText(overview);
    for (const foot of ["View the 400 orders", "View the 370 orders", "View the 55 orders", "View the rate by month", "View the times by region and warehouse"]) {
      expect(text).toContain(foot);
    }
  });
});

describe("the Delivery page's cards and bars open their orders (ticket 29)", () => {
  it("Delivered orders opens the delivered orders: 370", async () => {
    const href = hrefNamed(delivery, "Delivered orders: view the 370 orders");
    expect(href).toBe(`/data?${DELIVERED}`);
    expect(await ordersShown(href)).toBe(370);
  });

  it("On-time delivery rate opens the orders delivered on time: 304", async () => {
    const href = hrefNamed(delivery, "On-time delivery rate: view the 304 on-time orders");
    expect(href).toBe("/data?status=delivered");
    expect(await ordersShown(href)).toBe(304);
  });

  it("Delay rate opens the delayed orders: 55", async () => {
    const href = hrefNamed(delivery, "Delay rate: view the 55 delayed orders");
    expect(href).toBe("/data?status=delayed");
    expect(await ordersShown(href)).toBe(55);
  });

  it("Exceptions opens the exception orders: 11", async () => {
    const href = hrefNamed(delivery, "Exceptions: view the 11 orders");
    expect(href).toBe("/data?status=exception");
    expect(await ordersShown(href)).toBe(11);
  });

  it("Average delivery time opens the delivered orders, slowest first: 370", async () => {
    const href = hrefNamed(delivery, "Average delivery time: view the 370 orders, slowest first");
    expect(href).toBe(`/data?${DELIVERED}&sort=delivery_days&dir=desc`);
    expect(await ordersShown(href)).toBe(370);
  });

  it("a region or warehouse bar opens that place's delivered orders, as many as its n: US-C 71", async () => {
    const href = hrefNamed(delivery, "US-C: view the 71 delivered orders");
    expect(href).toBe(`/data?${DELIVERED}&region=US-C`);
    expect(await ordersShown(href)).toBe(71);
    const places = links(delivery).filter((link) => /^[A-Z][A-Z-]*\d?: view the \d+ delivered orders$/.test(link.name));
    expect(places).toHaveLength(5 + 9);
    for (const { name, href: placeHref } of places) {
      expect(await ordersShown(placeHref)).toBe(Number(/view the (\d+)/.exec(name)?.[1]));
    }
  });
});

describe("the Carriers page's highlights, bars and rows open their orders (ticket 29)", () => {
  it("Most orders opens FedEx's orders: 89", async () => {
    const href = hrefNamed(carriers, "Most orders: view the 89 FedEx orders");
    expect(href).toBe("/data?carrier=FedEx");
    expect(await ordersShown(href)).toBe(89);
  });

  it("Highest on-time rate opens DHL's delivered orders: 58", async () => {
    const href = hrefNamed(carriers, "Highest on-time rate, n ≥ 20: view the 58 delivered DHL orders");
    expect(href).toBe(`/data?${DELIVERED}&carrier=DHL`);
    expect(await ordersShown(href)).toBe(58);
  });

  it("Highest delay rate opens USPS's delayed orders: 11", async () => {
    const href = hrefNamed(carriers, "Highest delay rate, n ≥ 20: view the 11 delayed USPS orders");
    expect(href).toBe("/data?status=delayed&carrier=USPS");
    expect(await ordersShown(href)).toBe(11);
  });

  it("a delay-rate bar opens that carrier's delayed orders, as many as the rate's numerator", async () => {
    // docs/data.md: GLS 2/8, USPS 11/47, UPS 17/78, Royal Mail 5/25.
    for (const [carrier, delayed] of [["GLS", 2], ["USPS", 11], ["UPS", 17], ["Royal Mail", 5]] as const) {
      const href = hrefNamed(carriers, `${carrier}: view the ${delayed} delayed orders`);
      expect(href).toBe(`/data?status=delayed&carrier=${carrier.replace(" ", "+")}`);
      expect(await ordersShown(href)).toBe(delayed);
    }
  });

  it("a table row opens that carrier's orders, as many as it has", async () => {
    // docs/data.md: orders per carrier.
    const counts = { FedEx: 89, UPS: 88, DHL: 63, USPS: 49, OnTrac: 29, LaserShip: 27, "Royal Mail": 26, DPD: 20, GLS: 9 };
    for (const [carrier, count] of Object.entries(counts)) {
      const href = hrefNamed(carriers, `${carrier}: view the ${count} orders`);
      expect(href).toBe(`/data?carrier=${carrier.replace(" ", "+")}`);
      expect(await ordersShown(href)).toBe(count);
    }
  });
});

describe("the Forecast page's scope cards open their forecast (ticket 29)", () => {
  it("a scope card opens the page with that scope chosen: BOOK, plan 53", async () => {
    const href = hrefNamed(forecast, "BOOK: view the forecast");
    expect(href).toBe("/forecast?scope=category&value=BOOK");
    const chosen = renderToStaticMarkup(await ForecastPage({ searchParams: Promise.resolve(Object.fromEntries(new URL(href, "http://localhost").searchParams)) }));
    // docs/data.md: BOOK over 3 months, plan 53 (36 + 17).
    expect(visibleText(chosen)).toContain("Category BOOK · Jan–Mar 2026");
    expect(visibleText(chosen)).toMatch(/Units to plan for 53 Forecast demand 36 Safety stock 17/);
  });

  it("every one of the 22 scope cards is a link to its forecast", () => {
    expect(links(forecast).filter((link) => /^[A-Z][A-Z-]*\d?: view the forecast$/.test(link.name))).toHaveLength(22);
    expect(hrefNamed(forecast, "LON-FC1: view the forecast")).toBe("/forecast?scope=warehouse&value=LON-FC1");
    expect(hrefNamed(forecast, "US-E: view the forecast")).toBe("/forecast?scope=region&value=US-E");
  });
});

/** A query answer, which must have orders behind it. */
function answerFor(spec: Record<string, unknown>): Answer & { ordersBehind: NonNullable<Answer["ordersBehind"]> } {
  const answer = answerQuery(querySpecSchema.parse({ tool: "query", ...spec }));
  if (answer.kind !== "result" || answer.ordersBehind === undefined) throw new Error("no orders behind the answer");
  return { ...answer, ordersBehind: answer.ordersBehind };
}

describe("an Ask answer's link opens the orders it counts (ticket 29)", () => {
  it("a filtered question: the USPS delay rate opens the 47 delivered orders it divides by", async () => {
    const answer = answerFor({ metric: "delay_rate", filters: { carrier: ["USPS"] } });
    // docs/data.md: USPS 11 / 47.
    expect(answer.rows[0]?.denominator).toBe(47);
    expect(answer.ordersBehind.count).toBe(47);
    expect(await ordersShown(ordersHref(answer.ordersBehind.view))).toBe(47);
  });

  it("a period: delayed orders in Nov 2025, by delivery date, open the 3 it counts", async () => {
    const answer = answerFor({ metric: "delayed_orders", period: { type: "month", month: 11, year: 2025 } });
    // docs/data.md: 3 by delivery date.
    expect(answer.matchingOrders?.total).toBe(3);
    expect(await ordersShown(ordersHref(answer.ordersBehind.view))).toBe(3);
  });
});

describe("links never hold links (ticket 29)", () => {
  it("no link on the four pages holds another link or a button", () => {
    for (const html of [overview, delivery, carriers, forecast]) expect(nestsInteractive(html)).toBe(false);
  });
});
