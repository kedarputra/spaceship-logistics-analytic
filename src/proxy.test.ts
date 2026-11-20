import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { RATE_LIMIT_MESSAGE } from "./app/api/rate-limit";
import { config, proxy } from "./proxy";

function ask(ip: string): Response {
  return proxy(new NextRequest("http://localhost/api/ask", { method: "POST", headers: { "cf-connecting-ip": ip } }));
}

/** NextResponse.next(): the request goes on to its route. */
function passedOn(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

describe("the proxy in front of /api/* (ADR 0010 §5)", () => {
  it("passes 20 questions a minute from one IP, then answers 429 with the message the page shows", async () => {
    const answers = Array.from({ length: 21 }, () => ask("203.0.113.10"));
    expect(answers.slice(0, 20).every(passedOn)).toBe(true);
    const refused = answers[20];
    expect(refused?.status).toBe(429);
    expect(await refused?.json()).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
  });

  it("does not hold one IP's questions against another's", () => {
    for (let index = 0; index < 21; index++) ask("203.0.113.11");
    expect(passedOn(ask("203.0.113.12"))).toBe(true);
  });

  it("runs only for /api/*, so the dashboard page is never limited", () => {
    expect(config.matcher).toBe("/api/:path*");
  });
});
