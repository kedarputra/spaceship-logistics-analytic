import { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, type Role } from "@/auth/roles";
import { createTestAccounts } from "@/auth/testing";
import { visibleText } from "@/components/markup-text";
import { proxy } from "@/proxy";
import { POST as askRoute } from "./api/ask/route";
import { DELETE as clearImportRoute, POST as importRoute } from "./api/import/route";
import { GET as templateRoute } from "./api/import/template/route";
import { GET as csvRoute } from "./api/orders.csv/route";
import { GET as reportRoute } from "./api/reports/[file]/route";
import { POST as runRoute } from "./api/run/route";
import AskRoute from "./ask/page";
import AttentionRoute from "./attention/page";
import CarriersRoute from "./carriers/page";
import DataRoute from "./data/page";
import DeliveryRoute from "./delivery/page";
import ForecastRoute from "./forecast/page";
import ImportRoute from "./import/page";
import InventoryRoute from "./inventory/page";
import LoginRoute from "./login/page";
import NetworkRoute from "./network/page";
import OverviewRoute from "./page";
import ReportsRoute from "./reports/page";
import UsersRoute from "./users/page";

// The request's cookies, which Next gives a page through next/headers.
const jar = vi.hoisted(() => ({ session: undefined as string | undefined }));
// Raw data's filters use the router, which only a browser has; redirect() stays real.
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
  jar.session = undefined;
});

type Who = "nobody" | Role;
type Outcome = "allowed" | "sign-in" | "403" | "401";

const WHO: readonly Who[] = ["nobody", ...ROLES];
const noQuery = { searchParams: Promise.resolve({}) };

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

// The header and one row of the file, as the template has them.
const ONE_ORDER = [
  "client_id,order_id,order_date,delivery_date,carrier,origin_city,destination_city,status,sku,product_category,quantity,unit_price_usd,order_value_usd,is_promo,promo_discount_pct,region,warehouse",
  'CL-1023,ORD-1,2025-10-19,2025-10-22,DHL,"London, UK","Leeds, UK",delivered,PAPER-0197,PAPER,2,13.11,26.22,0,0,UK,LON-FC1',
].join("\n");

const API: Record<string, { method: string; body?: string; headers?: Record<string, string>; route: (request: NextRequest) => Promise<Response> }> = {
  // An empty question is refused before the model would be called.
  "/api/ask": { method: "POST", body: JSON.stringify({ question: "" }), route: askRoute },
  "/api/run": { method: "POST", body: JSON.stringify({ spec: { tool: "query", metric: "order_count" } }), route: runRoute },
  "/api/orders.csv": { method: "GET", route: csvRoute },
  "/api/reports/2025-11.pdf": { method: "GET", route: reportRoute },
  "/api/reports/2025-11.csv": { method: "GET", route: reportRoute },
  // A check of the template's rows, from a page of this site (ticket 35).
  "/api/import": {
    method: "POST",
    body: ONE_ORDER,
    headers: { "sec-fetch-site": "same-origin", "content-type": "text/csv", "content-length": String(Buffer.byteLength(ONE_ORDER)), "x-file-name": "orders.csv" },
    route: importRoute,
  },
  "/api/import/template": { method: "GET", route: templateRoute },
  // Back to the original data: any session may drop its own import.
  "DELETE /api/import": { method: "DELETE", headers: { "sec-fetch-site": "same-origin" }, route: clearImportRoute },
};

/** A digest like NEXT_REDIRECT;replace;/login;307;, which redirect() throws. */
function redirectOf(error: unknown): string | undefined {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : "";
  return digest.startsWith("NEXT_REDIRECT") ? digest.split(";")[2] : undefined;
}

let ip = 0;

/** Opens a page as `who`: first the proxy, then the page itself, as Next would. One at a time: the cookie jar is shared. */
async function openPage(path: string, who: Who): Promise<{ outcome: Outcome; html: string }> {
  const headers: Record<string, string> = who === "nobody" ? {} : { cookie: accounts.cookie(who) };
  const gate = proxy(new NextRequest(`http://localhost${path}`, { headers }));
  if (gate.status === 307) return { outcome: "sign-in", html: "" };
  jar.session = who === "nobody" ? undefined : accounts.token(who);
  const page = PAGES[path];
  if (page === undefined) throw new Error(`No page ${path}`);
  const html = renderToStaticMarkup(await page(noQuery));
  return { outcome: html.includes(">No access<") ? "403" : "allowed", html };
}

/** Calls an API route as `who`: first the proxy, then the route. */
async function callApi(path: string, who: Who): Promise<Outcome> {
  const api = API[path];
  if (api === undefined) throw new Error(`No route ${path}`);
  ip += 1;
  const headers: Record<string, string> = { "cf-connecting-ip": `198.18.0.${ip}`, ...api.headers, ...(who === "nobody" ? {} : { cookie: accounts.cookie(who) }) };
  const request = () => new NextRequest(`http://localhost${path.replace(/^[A-Z]+ /, "")}`, { method: api.method, headers, body: api.body });
  const gate = proxy(request());
  if (gate.status === 401) return "401";
  const response = await api.route(request());
  if (response.status === 401 || response.status === 403) return response.status === 401 ? "401" : "403";
  return "allowed";
}

const EVERYONE = { nobody: "sign-in", viewer: "allowed", analyst: "allowed", admin: "allowed" } as const;
const ASKERS_API = { nobody: "401", viewer: "403", analyst: "allowed", admin: "allowed" } as const;

const EXPECTED: Record<string, Record<Who, Outcome>> = {
  "/": EVERYONE,
  "/attention": EVERYONE,
  "/delivery": EVERYONE,
  "/carriers": EVERYONE,
  "/inventory": EVERYONE,
  "/network": EVERYONE,
  "/reports": EVERYONE,
  "/forecast": EVERYONE,
  "/data": EVERYONE,
  "/ask": { nobody: "sign-in", viewer: "403", analyst: "allowed", admin: "allowed" },
  "/users": { nobody: "sign-in", viewer: "403", analyst: "403", admin: "allowed" },
  "/import": { nobody: "sign-in", viewer: "403", analyst: "403", admin: "allowed" },
  "/api/ask": ASKERS_API,
  "/api/run": ASKERS_API,
  "/api/orders.csv": ASKERS_API,
  "/api/reports/2025-11.pdf": ASKERS_API,
  "/api/reports/2025-11.csv": ASKERS_API,
  "/api/import": { nobody: "401", viewer: "403", analyst: "403", admin: "allowed" },
  "/api/import/template": { nobody: "401", viewer: "403", analyst: "403", admin: "allowed" },
  "DELETE /api/import": { nobody: "401", viewer: "allowed", analyst: "allowed", admin: "allowed" },
};

describe("every route for every role (ticket 31): allowed, sent to sign in, or refused", () => {
  const cases = Object.keys(EXPECTED).flatMap((path) => WHO.map((who) => [path, who] as const));

  it.each(cases)("%s as %s", async (path, who) => {
    const outcome = path in API ? await callApi(path, who) : (await openPage(path, who)).outcome;
    expect(outcome).toBe(EXPECTED[path]?.[who]);
  });
});

describe("API responses are never stored by a shared cache (ADR 0012, amended)", () => {
  /** The route's response as `who`, after the proxy has let it through. */
  async function answer(path: string, who: Who): Promise<Response> {
    const api = API[path];
    if (api === undefined) throw new Error(`No route ${path}`);
    const headers: Record<string, string> = who === "nobody" ? {} : { cookie: accounts.cookie(who) };
    return api.route(new NextRequest(`http://localhost${path}`, { method: api.method, headers, body: api.body }));
  }

  it.each(["/api/orders.csv", "/api/reports/2025-11.pdf", "/api/reports/2025-11.csv", "/api/run"])(
    "%s answers an analyst with its file or result, private, no-store",
    async (path) => {
      const response = await answer(path, "analyst");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it("keeps the download's own headers beside it", async () => {
    const response = await answer("/api/reports/2025-11.pdf", "admin");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename=/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("marks a 403, a 401 and a 404 the same way", async () => {
    const forbidden = await answer("/api/orders.csv", "viewer");
    const signedOut = await answer("/api/reports/2025-11.csv", "nobody");
    const missing = await reportRoute(new NextRequest("http://localhost/api/reports/2019-01.csv", { headers: { cookie: accounts.cookie("analyst") } }));
    expect([forbidden.status, signedOut.status, missing.status]).toEqual([403, 401, 404]);
    for (const response of [forbidden, signedOut, missing]) expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("the 403 page", () => {
  it("says what the role can't open, with links to the Overview and to sign in as someone else", async () => {
    const { html } = await openPage("/ask", "viewer");
    expect(visibleText(html).trim()).toBe("No access Your role, Viewer, can't open Ask the data. Overview Sign in as someone else");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Overview<\/a>/);
    expect(html).toMatch(/<form action="\/api\/logout" method="post">/);
    expect(visibleText((await openPage("/users", "analyst")).html)).toContain("Your role, Analyst, can't open Users.");
  });

  it("is never shown to a role that may open the page", async () => {
    expect((await openPage("/users", "admin")).html).not.toContain("No access");
  });
});

describe("links to Ask and the CSV show only for roles that can use them (ticket 31)", () => {
  const askLinks = (html: string) => (html.match(/href="\/ask\?q=/g) ?? []).length;

  it.each(["/", "/carriers", "/forecast"])("%s has Ask links for analysts and admins only", async (path) => {
    const counts: number[] = [];
    for (const role of ROLES) counts.push(askLinks((await openPage(path, role)).html));
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBe(counts[1]);
  });

  it("drops the Overview's ask box for a viewer", async () => {
    expect((await openPage("/", "viewer")).html).not.toContain('action="/ask"');
    expect((await openPage("/", "analyst")).html).toContain('action="/ask"');
  });

  it("offers Raw data's CSV download to analysts and admins only", async () => {
    const offered: boolean[] = [];
    for (const role of ROLES) offered.push((await openPage("/data", role)).html.includes("Download CSV"));
    expect(offered).toEqual([false, true, true]);
  });

  it("links the report files from Reports for analysts and admins, locks them for a viewer, and offers import to admins (ticket 34)", async () => {
    const seen: { downloads: number; locked: boolean; importLink: boolean }[] = [];
    for (const role of ROLES) {
      const { html } = await openPage("/reports", role);
      seen.push({ downloads: (html.match(/href="\/api\/(?:reports\/[^"]+|orders\.csv)"/g) ?? []).length, locked: html.includes("Analyst role needed"), importLink: html.includes('href="/import"') });
    }
    expect(seen).toEqual([
      { downloads: 0, locked: true, importLink: false },
      { downloads: 3, locked: false, importLink: false },
      { downloads: 3, locked: false, importLink: true },
    ]);
  });
});

describe("the users page", () => {
  it("lists every account and its role, never a hash", async () => {
    const { html } = await openPage("/users", "admin");
    expect(visibleText(html)).toContain("Username Role viewer Viewer analyst Analyst admin Admin");
    expect(html).not.toContain("scrypt");
  });
});

describe("the sign-in page", () => {
  const login = async (next?: string) => renderToStaticMarkup(await LoginRoute({ searchParams: Promise.resolve(next === undefined ? {} : { next }) }));

  it("has the product name, Username, Password and Sign in, and nothing else", async () => {
    const html = await login("/ask");
    expect(visibleText(html).trim()).toBe("Logistics Analytics Username Password Sign in");
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toMatch(/<form[^>]*method="post"/);
  });

  it("says sign-in isn't configured, with no form, when the server has no usable secret", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    const html = await login();
    expect(visibleText(html).trim()).toBe("Logistics Analytics Sign-in isn't configured on this server.");
    expect(html).not.toContain("password");
  });

  it("says the same when the users file is missing", async () => {
    vi.stubEnv("AUTH_USERS_FILE", `${accounts.env.AUTH_USERS_FILE}.gone`);
    expect(visibleText(await login())).toContain("Sign-in isn't configured on this server.");
  });

  it("sends someone already signed in on to next, if it is on this site", async () => {
    jar.session = accounts.token("analyst");
    expect(await login("/ask").then(() => undefined, redirectOf)).toBe("/ask");
    expect(await login("https://evil.example").then(() => undefined, redirectOf)).toBe("/");
  });
});

describe("a removed account", () => {
  it("is sent to sign in by the page itself, though its cookie still passes the proxy", async () => {
    const token = accounts.token("analyst");
    accounts.write([{ username: "viewer", role: "viewer" }]);
    jar.session = token;
    expect(proxy(new NextRequest("http://localhost/delivery", { headers: { cookie: `session=${token}` } })).headers.get("x-middleware-next")).toBe("1");
    expect(await DeliveryRoute(noQuery).then(() => undefined, redirectOf)).toBe("/login");
    accounts.write(ROLES.map((role) => ({ username: role, role })));
  });
});
