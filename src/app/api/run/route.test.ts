import { describe, expect, it } from "vitest";
import type { Answer } from "@/tools/answer";
import { POST } from "./route";

function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new Request("http://localhost/api/run", { method: "POST", body, headers }));
}

function isAnswer(body: unknown): body is Answer {
  return typeof body === "object" && body !== null && "kind" in body && body.kind === "result" && "followUps" in body;
}

async function run(spec: Record<string, unknown>): Promise<Answer> {
  const response = await post(JSON.stringify({ spec: { tool: "query", ...spec } }));
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  if (!isAnswer(body)) throw new Error(`Not an answer: ${JSON.stringify(body)}`);
  return body;
}

describe("POST /api/run: the R3 questions, golden numbers from docs/data.md and ADR 0002", () => {
  it('"How many orders were delivered late last month?" = 3, for 1–30 Nov 2025 by delivery date', async () => {
    const result = await run({ metric: "delayed_orders", period: { type: "previous", unit: "month" } });
    expect(result.rows).toEqual([expect.objectContaining({ value: 3 })]);
    expect(result.period.label).toBe("1–30 Nov 2025");
    expect(result.dateField).toBe("delivery_date");
    expect(result.matchingOrders?.total).toBe(3);
  });

  it('"Show delayed orders by week for the last 3 months" = 10 over 14 weekly buckets, 7 of them non-zero', async () => {
    const result = await run({ metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } });
    expect(result.period.label).toBe("1 Oct–31 Dec 2025");
    expect(result.rows).toHaveLength(14);
    const nonZero = result.rows.filter((row) => (row.value ?? 0) > 0).map((row) => [row.label, row.value]);
    expect(nonZero).toEqual([
      ["w/c 6 Oct", 2],
      ["w/c 13 Oct", 1],
      ["w/c 3 Nov", 1],
      ["w/c 17 Nov", 2],
      ["w/c 1 Dec", 1],
      ["w/c 8 Dec", 1],
      ["w/c 15 Dec", 2],
    ]);
    expect(result.matchingOrders?.total).toBe(10);
    expect([result.rows[0]?.partial, result.rows[13]?.partial]).toEqual([true, true]);
  });

  it('"Which carrier has the highest delay rate?" flags GLS (2/8) and names USPS (23.4%, 11/47)', async () => {
    const result = await run({ metric: "delay_rate", groupBy: "carrier", sort: "desc", limit: 1 });
    expect(result.ranking?.case).toBe("small-sample-top");
    expect(result.ranking?.top).toMatchObject({ label: "GLS", numerator: 2, denominator: 8, smallSample: true });
    expect(result.ranking?.topReliable).toMatchObject({ label: "USPS", numerator: 11, denominator: 47, smallSample: false });
    expect((result.ranking?.topReliable?.value ?? Number.NaN) * 100).toBeCloseTo(23.4, 1);
    expect(result.ranking?.minDelivered).toBe(20);
  });
});

describe("POST /api/run: the answer around the numbers (ADR 0006 §6–8)", () => {
  it("carries the interpretation, the chart chosen by code, and the follow-up chips", async () => {
    const answer = await run({ metric: "delayed_orders", period: { type: "previous", unit: "month" } });
    expect(answer.interpretation).toBe("Delayed orders, 1–30 Nov 2025 by delivery date.");
    expect(answer.chart).toEqual({ type: "answer-card", hiddenRows: 0 });
    expect(answer.followUps.map((followUp) => followUp.label)).toContain("December 2025 instead?");
  });

  it("answers a period with no data with its message, and nothing to chart", async () => {
    const response = await post(JSON.stringify({ spec: { tool: "query", metric: "order_count", period: { type: "previous", unit: "year" } } }));
    expect(await response.json()).toEqual({
      kind: "no-data",
      message: "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025.",
    });
  });
});

describe("POST /api/run: what it refuses (ADR 0009 §7–8)", () => {
  it("rejects a body over 16 KB from its declared length, before reading it", async () => {
    const response = await post("{}", { "content-length": String(16 * 1024 + 1) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "The request body is over 16 KB." });
  });

  it("rejects a body over 16 KB that does not declare its length", async () => {
    const padding = "x".repeat(16 * 1024);
    const response = await post(JSON.stringify({ spec: { tool: "query", metric: "order_count" }, padding }));
    expect(response.status).toBe(413);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await post("metric=order_count");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The request body is not valid JSON." });
  });

  it("rejects an invalid spec with every problem in it, and runs nothing", async () => {
    const response = await post(JSON.stringify({ spec: { tool: "query", metric: "order_count", filters: { carrier: ["fedx"] }, limit: 50 } }));
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "The query spec is not valid.",
      issues: expect.arrayContaining([
        { path: "spec.filters.carrier.0", message: 'Unknown carrier "fedx". Did you mean "FedEx"?' },
        expect.objectContaining({ path: "spec.limit" }),
      ]),
    });
  });

  it("rejects a body without a spec, or with fields beside it", async () => {
    expect((await post(JSON.stringify({ tool: "query", metric: "order_count" }))).status).toBe(400);
    expect((await post(JSON.stringify({ spec: { tool: "query", metric: "order_count" }, question: "hi" }))).status).toBe(400);
  });
});
