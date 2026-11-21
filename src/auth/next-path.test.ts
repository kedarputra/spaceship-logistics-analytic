import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("where sign-in goes next (ticket 31)", () => {
  it.each([
    ["/ask", "/ask"],
    ["/ask?q=Which+carrier+is+the+least+reliable%3F", "/ask?q=Which+carrier+is+the+least+reliable%3F"],
    ["/data?status=delayed&carrier=FedEx#orders", "/data?status=delayed&carrier=FedEx#orders"],
    ["/", "/"],
  ])("follows a relative path on this site: %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    "https://evil.example/ask",
    "//evil.example/ask",
    "/\\evil.example",
    "\\\\evil.example",
    "/%5Cevil.example",
    "javascript:alert(1)",
    "ask",
    " /ask",
    "/ask\nSet-Cookie: x",
    "/ask\t",
    "/login",
    "/login?next=/ask",
    "",
    undefined,
    ["/ask", "/data"],
    `/${"a".repeat(2100)}`,
  ])("sends anything else to the Overview: %j", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });
});
