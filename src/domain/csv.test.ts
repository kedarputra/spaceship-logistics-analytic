import { describe, expect, it } from "vitest";
import { csvField, csvLine } from "./csv";

describe("a CSV cell (tickets 28 and 34)", () => {
  it("is written as it is when it holds nothing a spreadsheet or a CSV reader would act on", () => {
    expect(csvField("ORD-2026-380870-0106")).toBe("ORD-2026-380870-0106");
    expect(csvField("2025-11-03")).toBe("2025-11-03");
    expect(csvField("1600.98")).toBe("1600.98");
    expect(csvField("")).toBe("");
  });

  it("is quoted when it holds a comma, a quote or a line break, its quotes doubled", () => {
    expect(csvField("London, UK")).toBe('"London, UK"');
    expect(csvField('the "best" carrier')).toBe('"the ""best"" carrier"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
  });

  it("starts with a ' when it starts with =, +, -, @, a tab or a carriage return, so a spreadsheet never runs it as a formula", () => {
    expect(csvField("=HYPERLINK(\"http://example.com\")")).toBe("\"'=HYPERLINK(\"\"http://example.com\"\")\"");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tcmd")).toBe("'\tcmd");
    expect(csvField("\rcmd")).toBe("\"'\rcmd\"");
    // Only the first character counts.
    expect(csvField("A-1")).toBe("A-1");
  });

  it("joins a line's cells with commas", () => {
    expect(csvLine(["carriers", "Royal Mail", "delivered_orders", "2", ""])).toBe("carriers,Royal Mail,delivered_orders,2,");
    expect(csvLine(["lanes", "London, UK → Leeds, UK", "=1+1"])).toBe("lanes,\"London, UK → Leeds, UK\",'=1+1");
  });
});
