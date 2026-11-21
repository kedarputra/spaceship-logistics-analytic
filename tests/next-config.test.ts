import { describe, expect, it } from "vitest";
import { IMPORT_LIMITS } from "@/domain/orders";
import nextConfig from "../next.config";

describe("next.config.ts", () => {
  it("keeps the request proxy's copy of a body to one byte past an import's 5 MB, so no larger upload is held whole (ticket 35, ADR 0013)", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(IMPORT_LIMITS.bytes + 1);
  });
});
