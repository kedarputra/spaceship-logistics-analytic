import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it('answers {"rows":400,"anchor":"2025-12-31"}', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).toBe('{"rows":400,"anchor":"2025-12-31"}');
  });
});
