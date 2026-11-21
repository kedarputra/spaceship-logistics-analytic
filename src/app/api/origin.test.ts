import { describe, expect, it } from "vitest";
import { sameOrigin } from "./origin";

const from = (headers: Record<string, string>) => sameOrigin(new Headers(headers));

describe("the same-site check on state-changing routes (ticket 31)", () => {
  it("trusts the browser's Sec-Fetch-Site when it sends one, whatever the proxy did to Host", () => {
    expect(from({ "sec-fetch-site": "same-origin", origin: "https://wms.example", host: "127.0.0.1:4800" })).toBe(true);
    expect(from({ "sec-fetch-site": "cross-site", origin: "https://wms.example", host: "wms.example" })).toBe(false);
    expect(from({ "sec-fetch-site": "same-site", origin: "https://other.wms.example", host: "wms.example" })).toBe(false);
    expect(from({ "sec-fetch-site": "none", host: "wms.example" })).toBe(false);
  });

  it("otherwise needs an Origin naming the host the request was sent to", () => {
    expect(from({ origin: "https://wms.example", host: "wms.example" })).toBe(true);
    expect(from({ origin: "https://wms.example", host: "127.0.0.1:4800", "x-forwarded-host": "wms.example" })).toBe(true);
    expect(from({ origin: "https://evil.example", host: "wms.example" })).toBe(false);
    expect(from({ host: "wms.example" })).toBe(false);
    expect(from({ origin: "null", host: "wms.example" })).toBe(false);
  });
});
