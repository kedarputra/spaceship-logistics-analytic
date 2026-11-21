import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/auth/roles";
import { createTestAccounts } from "@/auth/testing";
import { proxy } from "@/proxy";
import { pdfPages } from "../pdf-text";
import { GET } from "./route";

// The monthly report's files (ticket 34): downloads, so analysts and admins (ADR 0012).
const accounts = createTestAccounts();
afterAll(() => accounts.remove());
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
});

function download(file: string, who: Role = "analyst"): Promise<Response> {
  return Promise.resolve(GET(new NextRequest(`http://localhost/api/reports/${file}`, { headers: { cookie: accounts.cookie(who) } })));
}

interface Downloaded {
  response: Response;
  bytes: Uint8Array;
  pages: string[][];
  /** Every text run on every page. */
  lines: string[];
}

let november: Promise<Downloaded> | undefined;

/** Nov 2025's PDF, downloaded once by the first test that asks for it, when the sign-in settings are stubbed. */
function novemberPdf(): Promise<Downloaded> {
  november ??= download("2025-11.pdf").then(async (response) => {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pages = response.status === 200 ? pdfPages(bytes) : [];
    return { response, bytes, pages, lines: pages.flat() };
  });
  return november;
}

describe("GET /api/reports/<YYYY-MM>.pdf (ticket 34)", () => {
  it("is a PDF named for its month, to download", async () => {
    const { response, bytes } = await novemberPdf();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="wms-report-2025-11.pdf"');
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("is one or two A4 pages and under 500 KB", async () => {
    const { bytes, pages } = await novemberPdf();
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages.length).toBeLessThanOrEqual(2);
    expect(Buffer.from(bytes).toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(bytes.byteLength).toBeLessThan(500 * 1024);
  });

  it("embeds Figtree and no built-in font", async () => {
    const raw = Buffer.from((await novemberPdf()).bytes).toString("latin1");
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Figtree-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Figtree-Bold/);
    expect(raw).not.toMatch(/\/BaseFont \/Helvetica/);
  });

  it("has a header with the app, the month, the dataset, its anchor date and the day it was made", async () => {
    const { pages } = await novemberPdf();
    expect(pages[0]?.slice(0, 3)).toEqual([
      "LOGISTICS ANALYTICS",
      "Monthly WMS report · Nov 2025",
      expect.stringMatching(/^Dataset mock_logistics_data\.csv · Data as of 31 Dec 2025 · Generated \d{1,2} [A-Z][a-z]{2} \d{4}$/),
    ]);
  });

  it("says the month's figures and Oct's, with the changes", async () => {
    const { lines } = await novemberPdf();
    for (const figure of ["24", "26", "−2", "$1,600.98", "$912.02", "+$688.96", "84.2% · 16 of 19", "81.8% · 18 of 22", "+2.4 points", "15.8% · 3 of 19", "3.7 days"]) {
      expect(lines).toContain(figure);
    }
  });

  it("states each section's basis in its header, the snapshot of the orders in transit included", async () => {
    const { lines } = await novemberPdf();
    for (const basis of ["Nov 2025 · by order date", "Nov 2025 · by delivery date", "Nov 2025 · orders by order date, deliveries by delivery date", "Placed in Nov 2025 · still in transit on 31 Dec 2025, or canceled"]) {
      expect(lines).toContain(basis);
    }
  });

  it("lists the carriers with the small-sample tag, the warehouses, the top categories and SKUs, and the orders to act on", async () => {
    const { lines } = await novemberPdf();
    for (const name of ["USPS", "Royal Mail", "small sample", "EWR-DC1", "All warehouses", "PAINT", "$406.92", "PAINT-0037", "ORD-2026-542610-0082", "58"]) {
      expect(lines).toContain(name);
    }
  });

  it("draws the outcomes per week, a value under every bar for each outcome, and notes the clipped first week", async () => {
    const { lines } = await novemberPdf();
    for (const week of ["w/c 27 Oct", "w/c 3 Nov", "w/c 10 Nov", "w/c 17 Nov", "w/c 24 Nov", "On time", "Delayed", "Exception"]) expect(lines).toContain(week);
    // The row of delayed orders under the five weeks: the amber marks keep their values (ADR 0011 §3).
    const delayed = lines.indexOf("Delayed", lines.indexOf("w/c 24 Nov"));
    expect(lines.slice(delayed, delayed + 6)).toEqual(["Delayed", "0", "1", "0", "2", "0"]);
    expect(lines).toContain("Weeks run Monday to Sunday. w/c 27 Oct: 1–2 Nov only.");
  });

  it("numbers its pages in the footer", async () => {
    const { pages } = await novemberPdf();
    pages.forEach((page, index) => expect(page).toContain(`Page ${index + 1} of ${pages.length}`));
  });
});

describe("GET /api/reports/<YYYY-MM>.csv (ticket 34)", () => {
  it("is the month's CSV, named for it, a row per figure", async () => {
    const response = await download("2025-11.csv");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="wms-report-2025-11.csv"');
    const lines = (await response.text()).split("\n");
    expect(lines.slice(0, 4)).toEqual(["section,item,metric,value,previous_month", "summary,all,order_count,24,26", "summary,all,units,113,79", "summary,all,gross_order_value,1600.98,912.02"]);
    expect(lines).toContain("delivery_outcomes,all,delayed_orders,3,3");
    expect(lines).toContain("carriers,USPS,delivered_orders,5,5");
    expect(lines).toContain("top_categories,PAINT,gross_order_value,406.92,64.6");
    expect(lines).toContain("needs_attention,in_transit,order_count,4,2");
  });
});

describe("the report files: roles, months and limits (ticket 34)", () => {
  it.each(["2025-11.pdf", "2025-11.csv"])("refuses %s to a viewer with 403, and gives it to an admin", async (file) => {
    const refused = await download(file, "viewer");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "Your role, Viewer, can't download data." });
    expect((await download(file, "admin")).status).toBe(200);
  });

  it("sends nobody signed in away with 401 at the proxy", () => {
    expect(proxy(new NextRequest("http://localhost/api/reports/2025-11.pdf")).status).toBe(401);
  });

  it.each(["2024-12.pdf", "2026-01.csv", "2025-13.pdf", "2025-1.csv", "2025-11.xlsx", "2025-11", "report.pdf"])("answers 404 for %s", async (file) => {
    const response = await download(file);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "There is no such report. Reports cover each month from Jan 2025 to Dec 2025, as YYYY-MM.pdf or YYYY-MM.csv." });
  });

  it("counts toward the per-IP /api/* limit, as the orders CSV does: 120 a minute, then 429", () => {
    const request = () => proxy(new NextRequest("http://localhost/api/reports/2025-11.pdf", { headers: { "cf-connecting-ip": "203.0.113.34", cookie: accounts.cookie("analyst") } }));
    const responses = Array.from({ length: 121 }, request);
    expect(responses.slice(0, 120).every((response) => response.headers.get("x-middleware-next") === "1")).toBe(true);
    expect(responses[120]?.status).toBe(429);
  });
});
