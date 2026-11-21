import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAccounts } from "@/auth/testing";
import { visibleText } from "@/components/markup-text";
import { DATASET_FILE } from "@/domain/orders";
import { DELETE as clearImportRoute, POST as importRoute } from "./api/import/route";
import { GET as templateRoute } from "./api/import/template/route";
import { POST as logoutRoute } from "./api/logout/route";
import { GET as csvRoute } from "./api/orders.csv/route";
import { GET as reportRoute } from "./api/reports/[file]/route";
import { POST as runRoute } from "./api/run/route";
import AskRoute from "./ask/page";
import AttentionRoute from "./attention/page";
import CarriersRoute from "./carriers/page";
import DataRoute from "./data/page";
import DeliveryRoute from "./delivery/page";
import ForecastRoute from "./forecast/page";
import { importStore } from "./import-store";
import ImportRoute from "./import/page";
import InventoryRoute from "./inventory/page";
import NetworkRoute from "./network/page";
import OverviewRoute from "./page";
import ReportsRoute from "./reports/page";
import UsersRoute from "./users/page";

// The request's cookies, which Next gives a page through next/headers.
const jar = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => ({ push: () => undefined }) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && jar.session !== undefined ? { name, value: jar.session } : undefined) }),
}));

const accounts = createTestAccounts();
afterAll(() => accounts.remove());
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
});

const FILE = readFileSync(path.join(process.cwd(), "data", DATASET_FILE), "utf8");
const [HEADER = "", ...LINES] = FILE.trimEnd().split("\n");
// The file's first 5 rows, the first for a client the file does not have. Dates run to 22 Oct 2025.
const FIVE = `${[HEADER, (LINES[0] ?? "").replace(/^CL-\d+/, "CL-9999"), ...LINES.slice(1, 5)].join("\n")}\n`;

// Two sessions of the same admin, as two browsers would hold: each sign-in has its own session ID.
const tokenA = accounts.token("admin");
const tokenB = accounts.token("admin");

const sameSite = { "sec-fetch-site": "same-origin" };
const cookieOf = (token: string) => ({ cookie: `session=${token}` });

async function useImport(token: string, csv = FIVE): Promise<Response> {
  return importRoute(
    new NextRequest("http://localhost/api/import?use=1", {
      method: "POST",
      headers: { ...cookieOf(token), ...sameSite, "content-type": "text/csv", "content-length": String(Buffer.byteLength(csv)), "x-file-name": "five.csv" },
      body: csv,
    }),
  );
}

type Page = (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>;
const PAGES: Record<string, Page> = {
  "/": OverviewRoute,
  "/attention": AttentionRoute,
  "/delivery": DeliveryRoute,
  "/carriers": CarriersRoute,
  "/inventory": InventoryRoute,
  "/network": NetworkRoute,
  "/reports": ReportsRoute,
  "/forecast": ForecastRoute,
  "/data": DataRoute,
  "/ask": AskRoute,
  "/users": UsersRoute,
  "/import": ImportRoute,
};

/** The page's markup as the session holding `token` gets it. */
async function markup(path: string, token: string): Promise<string> {
  jar.session = token;
  const page = PAGES[path];
  if (page === undefined) throw new Error(`No page ${path}`);
  return renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
}

/** The page's text, info popovers closed. */
async function open(path: string, token: string): Promise<string> {
  return visibleText(await markup(path, token));
}

async function call(route: (request: NextRequest) => Promise<Response>, url: string, token: string, init: { method?: string; body?: string } = {}): Promise<Response> {
  return route(new NextRequest(`http://localhost${url}`, { method: init.method ?? "GET", headers: { ...cookieOf(token), ...sameSite }, body: init.body }));
}

describe("an import is this session's only (ticket 35)", () => {
  it("is taken from one admin session", async () => {
    expect((await useImport(tokenA)).status).toBe(200);
  });

  it.each(Object.keys(PAGES))("%s reads each session's own dataset: the import for one, the file for the other", async (path) => {
    expect(await open(path, tokenA)).toContain("Data as of 22 Oct 2025");
    expect(await open(path, tokenB)).toContain("Data as of 31 Dec 2025");
  });

  it("shows the import's figures to its session and the file's to the other", async () => {
    expect(await open("/", tokenA)).toMatch(/Total orders 5 /);
    expect(await open("/", tokenB)).toMatch(/Total orders 400 /);
    expect(await markup("/data", tokenA)).toContain("The 5 orders of five.csv as the file has them.");
    expect(await markup("/data", tokenB)).toContain(`The 400 orders of ${DATASET_FILE} as the file has them.`);
  });

  it("downloads each session's own orders and report", async () => {
    const rowsOf = async (response: Response) => (await response.text()).trimEnd().split("\n").length - 1;
    expect(await rowsOf(await call(csvRoute, "/api/orders.csv", tokenA))).toBe(5);
    expect(await rowsOf(await call(csvRoute, "/api/orders.csv", tokenB))).toBe(400);
    expect((await call(reportRoute, "/api/reports/2025-12.csv", tokenA)).status).toBe(404);
    expect((await call(reportRoute, "/api/reports/2025-12.csv", tokenB)).status).toBe(200);
  });

  it("checks a spec's client against the session's data: the imported client runs only for the session that imported it", async () => {
    const spec = JSON.stringify({ spec: { tool: "query", metric: "order_count", filters: { client: ["CL-9999"] } } });
    const mine = await call(runRoute, "/api/run", tokenA, { method: "POST", body: spec });
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({ rows: [{ value: 1 }] });
    const other = await call(runRoute, "/api/run", tokenB, { method: "POST", body: spec });
    expect(other.status).toBe(400);
    expect(await other.json()).toMatchObject({ issues: [{ message: 'Unknown client "CL-9999". It is not in the data.' }] });
  });

  it("offers the template from the file in data/, the header and its first 5 rows, whatever the session imported", async () => {
    const response = await call(templateRoute, "/api/import/template", tokenA);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="orders-template.csv"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe(`${[HEADER, ...LINES.slice(0, 5)].join("\n")}\n`);
  });

  it("goes back to the original data for its session only", async () => {
    expect((await useImport(tokenB)).status).toBe(200);
    expect((await call(clearImportRoute, "/api/import", tokenA, { method: "DELETE" })).status).toBe(200);
    expect(await open("/", tokenA)).toMatch(/Total orders 400 /);
    expect(await open("/", tokenB)).toMatch(/Total orders 5 /);
  });

  it("goes on sign-out", async () => {
    const response = await call(logoutRoute, "/api/logout", tokenB, { method: "POST" });
    expect(response.status).toBe(303);
    expect(importStore().size()).toBe(0);
    // The cookie is cleared in the browser; read again before then, it is back on the file.
    expect(await open("/", tokenB)).toMatch(/Total orders 400 /);
  });

  it("has none for a session signed before session IDs", async () => {
    const body = Buffer.from(JSON.stringify({ username: "admin", role: "admin", expires: Date.now() + 60_000 })).toString("base64url");
    const { createHmac } = await import("node:crypto");
    const oldToken = `${body}.${createHmac("sha256", Buffer.from(accounts.env.AUTH_SECRET, "base64")).update(body).digest("base64url")}`;
    expect(await open("/", oldToken)).toMatch(/Total orders 400 /);
    expect((await useImport(oldToken)).status).toBe(409);
  });
});
