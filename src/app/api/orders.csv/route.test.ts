import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAccounts } from "@/auth/testing";
import { proxy } from "@/proxy";
import { GET } from "./route";

// Downloads are for analysts and admins (ticket 31); the roles themselves are tested in app/access.test.tsx.
const accounts = createTestAccounts();
afterAll(() => accounts.remove());
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
});

const FILE = readFileSync("data/mock_logistics_data.csv", "utf8");
const [HEADER] = FILE.split("\n");

function download(query = ""): Promise<Response> {
  return Promise.resolve(GET(new NextRequest(`http://localhost/api/orders.csv${query}`, { headers: { cookie: accounts.cookie("analyst") } })));
}

const lines = (body: string) => body.split("\n").filter((line) => line !== "");

describe("GET /api/orders.csv: the Raw data view as a file (ticket 28)", () => {
  it("gives every order exactly as the file has it when nothing is filtered", async () => {
    const response = await download();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="orders.csv"');
    expect(await response.text()).toBe(FILE);
  });

  it("gives the filtered orders under the file's own header, values raw, named orders-filtered.csv", async () => {
    const response = await download("?status=delayed&carrier=FedEx");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="orders-filtered.csv"');
    const body = await response.text();
    const [header, ...rows] = lines(body);
    expect(header).toBe(HEADER);
    expect(rows).toHaveLength(11);
    // Each row is a line of the file, unchanged: quoted cities, 0/1 promo, unpadded numbers.
    for (const row of rows) expect(FILE).toContain(`\n${row}\n`);
  });

  it("counts like the page: delayed 55, the three delivered statuses 370, promo 22", async () => {
    expect(lines(await (await download("?status=delayed")).text())).toHaveLength(1 + 55);
    expect(lines(await (await download("?status=delivered&status=delayed&status=exception")).text())).toHaveLength(1 + 370);
    expect(lines(await (await download("?promo=yes")).text())).toHaveLength(1 + 22);
  });

  it("keeps the view's sort, and leaves out what the page would ignore", async () => {
    // The slowest delivery is an exception order, 12 days (docs/data.md).
    const [, first] = lines(await (await download("?sort=delivery_days&dir=desc&page=3&foo=1")).text());
    expect(first).toContain(",exception,");
    expect(lines(await (await download("?page=3&foo=1")).text())).toHaveLength(1 + 400);
  });

  it("counts toward the per-IP /api/* limit: 120 a minute, then 429", () => {
    const request = () => proxy(new NextRequest("http://localhost/api/orders.csv", { headers: { "cf-connecting-ip": "203.0.113.28", cookie: accounts.cookie("analyst") } }));
    const responses = Array.from({ length: 121 }, request);
    expect(responses.slice(0, 120).every((response) => response.headers.get("x-middleware-next") === "1")).toBe(true);
    expect(responses[120]?.status).toBe(429);
  });
});
