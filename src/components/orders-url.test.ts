import { describe, expect, it } from "vitest";
import { getDataset, type Order } from "@/domain/orders";
import { runQuery } from "@/tools/query";
import { type QueryFilters, querySpecSchema } from "@/tools/spec";
import { ordersInView, pageOf } from "@/tools/orders-view";
import { readOrdersView } from "./orders-url";

const { orders } = getDataset();

type Params = Record<string, string | string[]>;

const read = (params: Params) => readOrdersView(params, getDataset());
const rows = (params: Params): Order[] => ordersInView(orders, read(params).view);
const ids = (list: readonly Order[]) => list.map((order) => order.order_id).sort();

/** The orders the query tool counts for a spec filter: its matching orders, all of them when there are 50 or fewer. */
function queryToolOrders(filters: QueryFilters): Order[] {
  const result = runQuery(querySpecSchema.parse({ tool: "query", metric: "order_count", filters }), getDataset());
  if (result.kind !== "result" || result.matchingOrders === undefined) throw new Error("Expected a count with its orders");
  if (result.matchingOrders.total > result.matchingOrders.orders.length) throw new Error("Pick a filter with 50 orders or fewer");
  return result.matchingOrders.orders;
}

// Expected counts: docs/data.md and docs/design/README.md.
describe("Raw data: the orders a URL asks for (ticket 28)", () => {
  it("shows all 400 orders in file order when the URL asks for nothing", () => {
    const all = rows({});
    expect(all).toHaveLength(400);
    expect(all.map((order) => order.order_id)).toEqual(orders.map((order) => order.order_id));
    expect(read({}).ignored).toEqual([]);
  });

  it("filters by status: delayed 55, exception 11, in transit 27, canceled 3, and the three delivered statuses 370", () => {
    expect(rows({ status: "delayed" })).toHaveLength(55);
    expect(rows({ status: "exception" })).toHaveLength(11);
    expect(rows({ status: "in_transit" })).toHaveLength(27);
    expect(rows({ status: "canceled" })).toHaveLength(3);
    expect(rows({ status: ["delivered", "delayed", "exception"] })).toHaveLength(370);
  });

  it("filters by carrier, region, warehouse and category, values matched as the query spec matches them", () => {
    expect(read({ carrier: "fedex" }).view.filters.carrier).toEqual(["FedEx"]);
    expect(rows({ carrier: "fedex" })).toHaveLength(89);
    expect(rows({ region: "US-E" })).toHaveLength(95);
    expect(rows({ region: ["UK", "EU"] })).toHaveLength(54 + 81);
    expect(rows({ category: "CRAYON" })).toHaveLength(69);
    expect(rows({ carrier: "FedEx", status: "delayed" })).toHaveLength(rows({ carrier: "FedEx" }).filter((order) => order.status === "delayed").length);
  });

  it("gives the same orders as the query tool for the same spec filter", () => {
    const cases: [Params, QueryFilters][] = [
      [{ carrier: "GLS" }, { carrier: ["GLS"] }],
      [{ status: "exception" }, { status: ["exception"] }],
      [{ promo: "yes" }, { promo: ["yes"] }],
      [{ region: "UK", status: "delayed" }, { region: ["UK"], status: ["delayed"] }],
      [{ category: "CRAYON", warehouse: "LON-FC1" }, { category: ["CRAYON"], warehouse: ["LON-FC1"] }],
      [{ status: ["in_transit", "canceled"], region: "US-W" }, { status: ["in_transit", "canceled"], region: ["US-W"] }],
      [{ origin: "London, UK", destination: "Leeds, UK" }, { origin: ["London, UK"], destination: ["Leeds, UK"] }],
      [{ client: "CL-1004", category: "PAINT" }, { client: ["CL-1004"], category: ["PAINT"] }],
      [{ sku: "CRAYON-0008" }, { sku: ["CRAYON-0008"] }],
    ];
    for (const [params, filters] of cases) expect(ids(rows(params)), JSON.stringify(params)).toEqual(ids(queryToolOrders(filters)));
  });

  it("filters by origin, destination, client and SKU, values matched as the query spec matches them (ticket 33)", () => {
    // Golden numbers: ticket 33, recomputed from the CSV.
    expect(read({ origin: "london" }).view.filters.origin).toEqual(["London, UK"]);
    expect(rows({ origin: "London, UK" })).toHaveLength(54);
    expect(read({ destination: "leeds" }).view.filters.destination).toEqual(["Leeds, UK"]);
    expect(rows({ origin: "London, UK", destination: "Leeds, UK" })).toHaveLength(15);
    expect(read({ client: "cl-1004" }).view.filters.client).toEqual(["CL-1004"]);
    expect(rows({ client: "CL-1004" })).toHaveLength(46);
    expect(rows({ client: "CL-1004", status: ["delivered", "delayed", "exception"] })).toHaveLength(43);
    expect(rows({ sku: "MARKER-0138" })).toHaveLength(2);
    expect(rows({ sku: ["MARKER-0138", "CRAYON-0008"] })).toHaveLength(5);
    expect(read({ origin: "London", client: "CL-1004", sku: "MARKER-0138", destination: "Leeds" }).ignored).toEqual([]);
  });

  it("ignores a client, SKU or city it does not know, and says why", () => {
    const { view, ignored } = read({ client: "CL-9999", sku: "PAPER-9999", destination: "Atlantis", origin: "Londn" });
    expect(view.filters).toEqual({});
    expect(ignored.map(({ parameter }) => parameter)).toEqual(["client=CL-9999", "sku=PAPER-9999", "destination=Atlantis", "origin=Londn"]);
    expect(ignored[0]?.reason).toContain('Unknown client "CL-9999"');
    expect(ignored[3]?.reason).toContain('Did you mean "London, UK"?');
  });

  it("filters promo orders: yes 22, no 378, and both is any", () => {
    expect(rows({ promo: "yes" })).toHaveLength(22);
    expect(rows({ promo: "no" })).toHaveLength(378);
    expect(rows({ promo: ["yes", "no"] })).toHaveLength(400);
    expect(read({ promo: ["yes", "no"] }).view.filters.promo).toBeUndefined();
  });

  it("filters by order date or delivery date, from month to month", () => {
    expect(rows({ status: "delayed", date: "delivery", from: "2025-11", to: "2025-11" })).toHaveLength(3);
    expect(rows({ status: "delayed", date: "order", from: "2025-11", to: "2025-11" })).toHaveLength(4);
    expect(rows({ status: "delayed", date: "delivery", from: "2025-12", to: "2025-12" })).toHaveLength(4);
    expect(rows({ status: "delayed", from: "2025-12", to: "2025-12" })).toHaveLength(3);
    // One end alone runs to the other end of the data.
    expect(rows({ status: "delayed", from: "2025-10" })).toHaveLength(10);
    expect(rows({ from: "2025-01", to: "2025-01" })).toHaveLength(75);
    // An order with no delivery date has no delivery month.
    expect(rows({ date: "delivery", from: "2025-01" })).toHaveLength(370);
  });

  it("searches order ID, client, SKU and both cities, in any case", () => {
    expect(rows({ q: "crayon-0008" })).toHaveLength(3);
    expect(rows({ q: "ORD-2026-267300-0001" }).map((order) => order.client_id)).toEqual(["CL-1023"]);
    expect(rows({ q: "cl-1023" })).toHaveLength(orders.filter((order) => order.client_id === "CL-1023").length);
    expect(rows({ q: "leeds" })).toHaveLength(orders.filter((order) => [order.origin_city, order.destination_city].includes("Leeds, UK")).length);
    expect(rows({ q: "Leeds" }).length).toBeGreaterThan(0);
    expect(rows({ q: "  " })).toHaveLength(400);
  });

  it("ignores a parameter it does not support, or a value it does not know, and says which", () => {
    const { view, ignored } = read({
      limit: "3",
      foo: "1",
      carrier: ["FedEx", "Foo"],
      date: "shipped",
      from: "2024-01",
      sort: "price",
      page: "two",
    });
    expect(view.filters).toEqual({ carrier: ["FedEx"] });
    expect(ignored.map(({ parameter }) => parameter)).toEqual(["limit", "foo", "carrier=Foo", "date=shipped", "from=2024-01", "sort=price", "page=two"]);
    expect(ignored.find(({ parameter }) => parameter === "carrier=Foo")?.reason).toContain('Unknown carrier "Foo"');
    expect(ordersInView(orders, view)).toHaveLength(89);
  });

  it("ignores a range that ends before it starts", () => {
    const { view, ignored } = read({ from: "2025-06", to: "2025-03" });
    expect(view.dates.range).toBeUndefined();
    expect(ignored.map(({ parameter }) => parameter)).toEqual(["from=2025-06", "to=2025-03"]);
  });

  it("sorts by one column either way, empty values last, ties in file order", () => {
    const slowest = rows({ sort: "delivery_days", dir: "desc" });
    expect(slowest[0]?.status).toBe("exception");
    expect(slowest.at(-1)?.delivery_date).toBeNull();
    expect(slowest.slice(-30).every((order) => order.delivery_date === null)).toBe(true);
    const fastest = rows({ sort: "delivery_days" });
    expect(fastest.at(-1)?.delivery_date).toBeNull();
    expect(rows({ sort: "order_date" })[0]?.order_date).toBe("2025-01-01");
    expect(rows({ sort: "order_date", dir: "desc" })[0]?.order_date).toBe("2025-12-30");
    // Ties keep file order: the first FedEx row in the file comes first among FedEx rows.
    const byCarrier = rows({ sort: "carrier" }).filter((order) => order.carrier === "FedEx");
    expect(byCarrier.map((order) => order.order_id)).toEqual(rows({ carrier: "FedEx" }).map((order) => order.order_id));
  });

  it("opens the orders in transit oldest first by order date, as Needs attention's View all does (ticket 32)", () => {
    const oldest = rows({ status: "in_transit", sort: "order_date" });
    expect(oldest.slice(0, 2).map((order) => order.order_id)).toEqual(["ORD-2026-182650-0096", "ORD-2026-616202-0285"]);
    // The one order in transit within the longest completed delivery is the youngest, so it comes last.
    expect(oldest.at(-1)?.order_id).toBe("ORD-2026-328876-0262");
  });

  it("sorts by transit age either way, orders not in transit last (ticket 32)", () => {
    const oldest = rows({ sort: "age", dir: "desc" });
    expect(oldest.slice(0, 2).map((order) => order.order_id)).toEqual(["ORD-2026-182650-0096", "ORD-2026-616202-0285"]);
    expect(oldest.slice(0, 27).every((order) => order.status === "in_transit")).toBe(true);
    expect(oldest.slice(27).some((order) => order.status === "in_transit")).toBe(false);
    const youngest = rows({ sort: "age" });
    expect(youngest[0]?.order_id).toBe("ORD-2026-328876-0262");
    expect(youngest.at(-1)?.status).not.toBe("in_transit");
    expect(read({ sort: "age" }).ignored).toEqual([]);
  });

  it("pages 50 orders at a time, and shows the last page for a page past the end", () => {
    expect(pageOf(rows({}), 2)).toMatchObject({ page: 2, pages: 8, first: 51, last: 100, total: 400 });
    expect(pageOf(rows({}), 2).rows[0]?.order_id).toBe(orders[50]?.order_id);
    expect(pageOf(rows({}), 9)).toMatchObject({ page: 8, first: 351, last: 400 });
    expect(pageOf(rows({ carrier: "FedEx" }), 2)).toMatchObject({ page: 2, pages: 2, first: 51, last: 89, total: 89 });
    expect(pageOf(rows({ q: "no such order" }), 3)).toMatchObject({ page: 1, pages: 1, total: 0, rows: [] });
  });
});
