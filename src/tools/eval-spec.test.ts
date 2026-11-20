import { describe, expect, it } from "vitest";
import { normalizeInterpretation, sameInterpretation } from "./eval-spec";
import { interpretationSchema } from "./spec";

/** A spec as the model might write it, validated as the app validates it. */
function spec(fields: Record<string, unknown>) {
  return interpretationSchema.parse(fields);
}

const same = (a: Record<string, unknown>, b: Record<string, unknown>) => sameInterpretation(spec(a), spec(b));

describe("comparing an interpretation with the expected one (ADR 0009 §12)", () => {
  it("ignores key order and the order of filter values", () => {
    expect(
      same(
        { tool: "query", metric: "order_count", filters: { carrier: ["UPS", "FedEx"], region: ["EU"] } },
        { filters: { region: ["EU"], carrier: ["FedEx", "UPS"] }, metric: "order_count", tool: "query" },
      ),
    ).toBe(true);
  });

  it("fills in defaults: no period is all the data, no filters is none", () => {
    expect(same({ tool: "query", metric: "order_count" }, { tool: "query", metric: "order_count", period: { type: "all" } })).toBe(true);
    expect(same({ tool: "query", metric: "order_count" }, { tool: "query", metric: "order_count", filters: {} })).toBe(true);
    expect(same({ tool: "query", metric: "order_count" }, { tool: "query", metric: "order_count", period: { type: "this", unit: "year" } })).toBe(false);
  });

  it("reads no sort on a category breakdown as highest first, but not on a series over time", () => {
    expect(same({ tool: "query", metric: "delay_rate", groupBy: "carrier" }, { tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "desc" })).toBe(true);
    expect(same({ tool: "query", metric: "delay_rate", groupBy: "carrier" }, { tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "asc" })).toBe(false);
    expect(same({ tool: "query", metric: "order_count", groupBy: "month" }, { tool: "query", metric: "order_count", groupBy: "month", sort: "desc" })).toBe(false);
  });

  it("reads the order date as no date field for a metric dated by order, but not for one dated by delivery", () => {
    expect(same({ tool: "query", metric: "order_count" }, { tool: "query", metric: "order_count", dateField: "order_date" })).toBe(true);
    expect(same({ tool: "query", metric: "delayed_orders" }, { tool: "query", metric: "delayed_orders", dateField: "order_date" })).toBe(false);
  });

  it("compares the date field the query tool will use, after an order count with a status filter is rewritten", () => {
    // Orders with status delivered become on-time deliveries, dated by delivery: the order date changes the answer.
    const delivered = { tool: "query", metric: "order_count", filters: { status: ["delivered"] } };
    expect(same(delivered, { ...delivered, dateField: "order_date" })).toBe(false);
    expect(same(delivered, delivered)).toBe(true);
  });

  it("fills in a month's or quarter's year the way the tools read it, so writing it out is not a miss", () => {
    // The data ends in December 2025: October is October 2025; a forecast's Q2 is the next one, Q2 2026.
    const october = { tool: "query", metric: "delayed_orders", period: { type: "month", month: 10 } };
    expect(same(october, { ...october, period: { type: "month", month: 10, year: 2025 } })).toBe(true);
    expect(same(october, { ...october, period: { type: "month", month: 10, year: 2024 } })).toBe(false);
    const q2 = { tool: "forecast", scope: { type: "total" }, target: { type: "quarter", quarter: 2 } };
    expect(same(q2, { ...q2, target: { type: "quarter", quarter: 2, year: 2026 } })).toBe(true);
    expect(same(q2, { ...q2, target: { type: "quarter", quarter: 2, year: 2027 } })).toBe(false);
  });

  it("ignores repeated filter values, and a sort or limit on a single value", () => {
    expect(same({ tool: "query", metric: "order_count", filters: { carrier: ["UPS", "UPS"] } }, { tool: "query", metric: "order_count", filters: { carrier: ["UPS"] } })).toBe(
      true,
    );
    expect(same({ tool: "query", metric: "on_time_rate" }, { tool: "query", metric: "on_time_rate", sort: "desc", limit: 1 })).toBe(true);
  });

  it("ignores the case of a forecast's SKU, which the forecast tool matches in any case", () => {
    expect(same({ tool: "forecast", scope: { type: "sku", value: "crayon-0008" } }, { tool: "forecast", scope: { type: "sku", value: "CRAYON-0008" } })).toBe(
      true,
    );
  });

  it("reads no forecast horizon as 3 months, and keeps a target apart from a horizon", () => {
    const total = { tool: "forecast", scope: { type: "total" } };
    expect(same(total, { ...total, horizon: { count: 3, unit: "month" } })).toBe(true);
    expect(same(total, { ...total, horizon: { count: 4, unit: "month" } })).toBe(false);
    expect(same({ ...total, target: { type: "year", year: 2027 } }, { ...total, horizon: { count: 12, unit: "month" } })).toBe(false);
  });

  it("compares an unsupported question by its reason only, since the 3 examples are the model's pick", () => {
    expect(
      same(
        { tool: "unsupported", reason: "numeric_filter", examples: ["orders_by_month", "on_time_by_region", "units_by_category"] },
        { tool: "unsupported", reason: "numeric_filter", examples: ["late_last_month", "delayed_by_week", "highest_delay_rate"] },
      ),
    ).toBe(true);
    expect(
      same(
        { tool: "unsupported", reason: "numeric_filter", examples: ["orders_by_month", "on_time_by_region", "units_by_category"] },
        { tool: "unsupported", reason: "two_breakdowns", examples: ["orders_by_month", "on_time_by_region", "units_by_category"] },
      ),
    ).toBe(false);
  });

  it("counts everything else, the assumption included, since it changes the note the user sees", () => {
    const late = { tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" } };
    expect(same(late, { ...late, assumption: "late" })).toBe(false);
    expect(same(late, { ...late, metric: "order_count" })).toBe(false);
    expect(same(late, { tool: "forecast", scope: { type: "total" } })).toBe(false);
  });

  it("shows the normalized spec, so a miss reads as the comparison saw it", () => {
    expect(normalizeInterpretation(spec({ tool: "query", metric: "delay_rate", groupBy: "carrier", filters: { carrier: ["UPS", "DHL"] } }))).toEqual({
      tool: "query",
      metric: "delay_rate",
      groupBy: "carrier",
      sort: "desc",
      period: { type: "all" },
      dateField: "delivery_date",
      filters: { carrier: ["DHL", "UPS"] },
    });
    expect(normalizeInterpretation(spec({ tool: "forecast", scope: { type: "total" }, target: { type: "year", year: 2027 } }))).toEqual({
      tool: "forecast",
      scope: { type: "total" },
      target: { from: "2027-01-01", to: "2027-12-01" },
    });
  });
});
