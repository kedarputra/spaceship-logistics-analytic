import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "@/auth/session";
import { DATASET_FILE, IMPORT_LIMITS } from "@/domain/orders";
import { createImportStore, type ImportStore } from "../../import-store";
import { createImportLimiter, handleClearImport, handleImport, type ImportLimiter, MAX_SHOWN_PROBLEMS, NO_SESSION_ID, NOT_IMPORTED, ONLY_CSV, PER_HOUR, uploadedFileName } from "./handle-import";
import { NO_LENGTH, NOT_UTF8, TOO_LARGE, TOO_MANY_ROWS, WRONG_LENGTH } from "./read-upload";

const FILE = readFileSync(path.join(process.cwd(), "data", DATASET_FILE), "utf8");
const [HEADER = "", ...LINES] = FILE.trimEnd().split("\n");
/** The file's header and its first `count` rows. */
const firstRows = (count: number) => `${[HEADER, ...LINES.slice(0, count)].join("\n")}\n`;

const NOW = Date.UTC(2026, 10, 22, 3, 0, 0);
const admin = { username: "admin", role: "admin" } as const;
const session = (sessionId = "AAAAAAAAAAAAAAAAAAAAAA"): Session => ({ ...admin, expires: NOW + 8 * 60 * 60 * 1000, sessionId });
/** A session signed before ticket 35: no session ID. */
const OLD_SESSION: Session = { ...admin, expires: NOW + 8 * 60 * 60 * 1000 };

let store: ImportStore;
let limiter: ImportLimiter;
let logged: string[];
beforeEach(() => {
  store = createImportStore();
  limiter = createImportLimiter();
  logged = [];
});

type Body = string | Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;

/** An upload as the page sends it: the file as the body, with its length; a stream's length is the caller's to give. */
function upload(body: Body, { use = false, name = "orders.csv", type = "text/csv", headers = {} }: { use?: boolean; name?: string; type?: string; headers?: Record<string, string> } = {}): Request {
  const length = typeof body === "string" ? Buffer.byteLength(body) : body instanceof Uint8Array ? body.byteLength : undefined;
  return new Request(`http://localhost/api/import${use ? "?use=1" : ""}`, {
    method: "POST",
    headers: {
      "sec-fetch-site": "same-origin",
      "content-type": type,
      "x-file-name": encodeURIComponent(name),
      ...(length === undefined ? {} : { "content-length": String(length) }),
      ...headers,
    },
    body,
    // Node needs this to send a stream as a request body.
    ...({ duplex: "half" } as object),
  });
}

async function send(request: Request, who: Session = session()): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleImport(request, { user: admin, session: who }, { store, limiter, log: (line) => logged.push(line), now: () => NOW });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/**
 * A body of `first`, then `chunks` copies of `piece`, each made only when the reader asks for it (no
 * read-ahead), counting the copies made.
 */
function lazyBody(piece: string, chunks: number, first = ""): { stream: ReadableStream<Uint8Array>; pulled: () => number } {
  const bytes = new TextEncoder().encode(piece);
  let sent = 0;
  let started = first === "";
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (!started) {
          started = true;
          controller.enqueue(new TextEncoder().encode(first));
        } else if (sent === chunks) controller.close();
        else {
          sent += 1;
          controller.enqueue(bytes);
        }
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => sent };
}

describe("POST /api/import: checking a file (ticket 35)", () => {
  it("answers a clean file with its rows, no problems, and the five KPIs and anchor date it would show", async () => {
    const { status, body } = await send(upload(FILE));
    expect(status).toBe(200);
    expect(body).toMatchObject({ fileName: "orders.csv", rows: 400, problemCount: 0, problems: [], preview: { anchor: "2025-12-31" } });
    expect(body.preview).toMatchObject({ kpis: { totalOrders: { count: 400, inTransit: 27, canceled: 3 }, delayedOrders: { count: 55 } } });
    expect(store.size()).toBe(0);
  });

  it("lists every problem with its row and column, the first 100 of them, and counts the rest", async () => {
    const bad = LINES.map((line) => line.replace(",DHL,", ",Acme,"));
    const dhl = LINES.filter((line) => line.includes(",DHL,")).length;
    const { status, body } = await send(upload(`${[HEADER, ...bad].join("\n")}\n`));
    expect(status).toBe(200);
    expect(body).toMatchObject({ rows: 400, problemCount: dhl });
    expect(body.preview).toBeUndefined();
    expect(body.problems).toContainEqual({ row: 2, column: "carrier", message: expect.stringContaining('Unknown carrier "Acme"') });

    const many = await send(upload(`${[HEADER, ...LINES.map((line) => line.replace(/,(delivered|delayed|exception),/, ",lost,"))].join("\n")}\n`));
    expect(many.body.problemCount).toBeGreaterThan(MAX_SHOWN_PROBLEMS);
    expect(many.body.problems).toHaveLength(MAX_SHOWN_PROBLEMS);
  });

  it("strips a byte-order mark and takes text/plain too", async () => {
    const { body } = await send(upload(`\uFEFF${firstRows(5)}`, { type: "text/plain; charset=utf-8" }));
    expect(body).toMatchObject({ rows: 5, problemCount: 0 });
  });

  it("takes only a .csv sent as text/csv or text/plain, before counting it", async () => {
    expect(await send(upload(firstRows(5), { name: "orders.xlsx" }))).toEqual({ status: 415, body: { error: ONLY_CSV } });
    expect(await send(upload(firstRows(5), { type: "application/vnd.ms-excel" }))).toEqual({ status: 415, body: { error: ONLY_CSV } });
    expect(await send(upload(firstRows(5), { headers: { "x-file-name": "" } }))).toEqual({ status: 415, body: { error: ONLY_CSV } });
    for (let index = 0; index < PER_HOUR; index++) expect((await send(upload(firstRows(1)))).status).toBe(200);
  });

  it("reads the file as UTF-8 and refuses anything else", async () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode(firstRows(1)), 0xe9, 0x0a]);
    expect(await send(upload(latin1))).toEqual({ status: 400, body: { error: NOT_UTF8 } });
  });

  it("keeps the name to show without a path or control characters, at most 100 characters", () => {
    expect(uploadedFileName(encodeURIComponent("C:\\Users\\me\\orders (2).csv"))).toBe("orders (2).csv");
    expect(uploadedFileName(encodeURIComponent("a\u0007b.csv"))).toBe("ab.csv");
    expect(uploadedFileName(`${"x".repeat(150)}.csv`)).toHaveLength(100);
    expect(uploadedFileName("%E0%A4%A")).toBeUndefined();
    expect(uploadedFileName(null)).toBeUndefined();
  });
});

describe("POST /api/import: the size limits, while reading (ticket 35)", () => {
  it("refuses a body that declares more than 5 MB before reading it", async () => {
    const body = lazyBody("x", 10);
    const declared = upload(body.stream, { headers: { "content-length": String(IMPORT_LIMITS.bytes + 1) } });
    expect(await send(declared)).toEqual({ status: 413, body: { error: TOO_LARGE } });
    expect(body.pulled()).toBe(0);
  });

  it("stops reading a body once it runs past the 5 MB it gave, without reading the rest", async () => {
    // 64 KB pieces: 50 MB if read whole. 5 MB is 80 of them, so the 81st is the last one read.
    const body = lazyBody("x".repeat(64 * 1024), 800);
    const lying = upload(body.stream, { headers: { "content-length": String(IMPORT_LIMITS.bytes) } });
    expect(await send(lying)).toEqual({ status: 400, body: { error: WRONG_LENGTH } });
    expect(body.pulled()).toBe(81);
  });

  it("refuses a body that ends short of its length, as one the request proxy cut off would", async () => {
    const body = lazyBody(`${LINES[0] ?? ""}\n`, 10, `${HEADER}\n`);
    const cut = upload(body.stream, { headers: { "content-length": String(IMPORT_LIMITS.bytes) } });
    expect(await send(cut)).toEqual({ status: 400, body: { error: WRONG_LENGTH } });
  });

  it("refuses a body that gives no length", async () => {
    expect(await send(upload(lazyBody("x", 1).stream))).toEqual({ status: 411, body: { error: NO_LENGTH } });
  });
  it("takes a file of exactly 5 MB", async () => {
    const padded = `${firstRows(1).trimEnd()}\n`;
    const exact = `${padded}${" ".repeat(IMPORT_LIMITS.bytes - padded.length)}`;
    const { status, body } = await send(upload(exact));
    expect(status).toBe(200);
    expect(body).toMatchObject({ rows: 2 });
  });

  it("stops reading once the rows pass 20,000, without reading the rest", async () => {
    // Pieces of 1,000 rows under the header: 30,000 rows, under 5 MB, if read whole. The 21st piece passes 20,000.
    const piece = `${LINES[0] ?? ""}\n`.repeat(1000);
    const body = lazyBody(piece, 30, `${HEADER}\n`);
    const length = Buffer.byteLength(`${HEADER}\n`) + 30 * Buffer.byteLength(piece);
    expect(length).toBeLessThan(IMPORT_LIMITS.bytes);
    expect(await send(upload(body.stream, { headers: { "content-length": String(length) } }))).toEqual({ status: 413, body: { error: TOO_MANY_ROWS } });
    expect(body.pulled()).toBe(21);
  });

  it("takes exactly 20,000 rows", async () => {
    const rows = Array.from({ length: IMPORT_LIMITS.rows }, (_, index) => (LINES[index % LINES.length] ?? "").replace(/ORD-[\d-]+/, `ORD-X-${index}`));
    const { body } = await send(upload(`${[HEADER, ...rows].join("\n")}\n`));
    expect(body).toMatchObject({ rows: IMPORT_LIMITS.rows, problemCount: 0 });
  });
});

describe("POST /api/import?use=1: all or nothing, for this session (ticket 35)", () => {
  it("makes a clean file the session's dataset, its anchor computed from it", async () => {
    const { status, body } = await send(upload(firstRows(5), { use: true, name: "five.csv" }));
    expect(status).toBe(200);
    expect(body).toEqual({ used: true, fileName: "five.csv", rows: 5, anchor: "2025-10-22" });
    const imported = store.get("AAAAAAAAAAAAAAAAAAAAAA");
    expect(imported).toMatchObject({ fileName: "five.csv", imported: true, anchor: "2025-10-22" });
    expect(imported?.orders).toHaveLength(5);
    expect(imported?.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps nothing of a file with a problem, and leaves the session's earlier import as it was", async () => {
    await send(upload(firstRows(5), { use: true, name: "five.csv" }));
    const bad = `${[HEADER, ...LINES.slice(0, 9), (LINES[9] ?? "").replace(/,(delivered|delayed|in_transit|exception|canceled),/, ",lost,")].join("\n")}\n`;
    const { status, body } = await send(upload(bad, { use: true, name: "ten.csv" }));
    expect(status).toBe(422);
    expect(body).toMatchObject({ error: NOT_IMPORTED, rows: 10, problemCount: 1 });
    expect(store.get("AAAAAAAAAAAAAAAAAAAAAA")?.fileName).toBe("five.csv");
  });

  it("checks a file for a session signed before session IDs, but keeps no import for it: it has nowhere to keep one", async () => {
    expect((await send(upload(firstRows(5)), OLD_SESSION)).body).toMatchObject({ rows: 5, problemCount: 0 });
    expect(await send(upload(firstRows(5), { use: true }), OLD_SESSION)).toEqual({ status: 409, body: { error: NO_SESSION_ID } });
    expect(store.size()).toBe(0);
  });

  it("goes back to the original data for this session only", async () => {
    await send(upload(firstRows(5), { use: true }), session("AAAAAAAAAAAAAAAAAAAAAA"));
    await send(upload(firstRows(5), { use: true }), session("BBBBBBBBBBBBBBBBBBBBBB"));
    const response = handleClearImport(new Request("http://localhost/api/import", { method: "DELETE", headers: { "sec-fetch-site": "same-origin" } }), { session: session() }, store);
    expect(response.status).toBe(200);
    expect(store.get("AAAAAAAAAAAAAAAAAAAAAA")).toBeUndefined();
    expect(store.get("BBBBBBBBBBBBBBBBBBBBBB")?.orders).toHaveLength(5);
  });
});

describe("POST /api/import: security (ticket 35)", () => {
  it("refuses a request from another site, for a check, a use and going back alike", async () => {
    const crossSite = { "sec-fetch-site": "cross-site" };
    expect((await send(upload(firstRows(5), { headers: crossSite }))).status).toBe(403);
    expect((await send(upload(firstRows(5), { use: true, headers: crossSite }))).status).toBe(403);
    expect(handleClearImport(new Request("http://localhost/api/import", { method: "DELETE", headers: crossSite }), { session: session() }, store).status).toBe(403);
    expect(store.size()).toBe(0);
  });

  it(`allows ${PER_HOUR} checks and ${PER_HOUR} imports an hour per user, so checking a file and using it is one of each`, async () => {
    const as = (username: string, request: Request) => handleImport(request, { user: { username, role: "admin" }, session: session() }, { store, limiter, log: () => undefined, now: () => NOW });
    for (let index = 0; index < PER_HOUR; index++) {
      expect((await as("admin", upload(firstRows(1)))).status).toBe(200);
      expect((await as("admin", upload(firstRows(1), { use: true }))).status).toBe(200);
    }
    const check = await as("admin", upload(firstRows(1)));
    expect(check.status).toBe(429);
    expect(check.headers.get("retry-after")).toBe("3600");
    expect(await check.json()).toEqual({ error: "At most 10 checks an hour. Try again in 60 minutes." });
    expect(await (await as("admin", upload(firstRows(1), { use: true }))).json()).toEqual({ error: "At most 10 imports an hour. Try again in 60 minutes." });
    expect((await as("admin2", upload(firstRows(1)))).status).toBe(200);
  });

  it("logs one line per upload with its size, rows and problem count, and nothing of its content", async () => {
    await send(upload(firstRows(2)));
    await send(upload(`${firstRows(2)}${(LINES[2] ?? "").replace(/^CL-\d+/, "=HYPERLINK(1)")}\n`, { use: true, name: "client-list.csv" }));
    expect(logged).toEqual([`Import checked: ${firstRows(2).length} bytes, 2 rows, 0 problems.`, expect.stringMatching(/^Import used: \d+ bytes, 3 rows, 1 problems\.$/)]);
    expect(logged.join(" ")).not.toMatch(/CL-|HYPERLINK|client-list|DHL/);
  });
});
