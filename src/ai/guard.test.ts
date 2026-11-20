import { describe, expect, it } from "vitest";
import { checkForecastWording, checkNumbers } from "./guard";

const FACTS = [
  "Period: 1–30 Nov 2025 (last month), by delivery date",
  "Delayed orders: 3",
  "Delay rate, top: GLS 25.0% (2 of 8 delivered orders), a small sample",
  "Units: 1,310",
  "Small-sample threshold: at least 20 delivered orders",
].join("\n");

describe("the number guard (ADR 0009 §4)", () => {
  it('accepts numbers that are in the facts as written: "1–30 Nov 2025", "at least 20 deliveries"', () => {
    expect(checkNumbers("3 orders were delivered late in 1–30 Nov 2025.", FACTS)).toEqual({ ok: true });
    expect(checkNumbers("GLS has 25.0% (2 of 8) but on fewer than at least 20 deliveries.", FACTS)).toEqual({ ok: true });
    expect(checkNumbers("A group needs at least 20 deliveries to be ranked.", FACTS)).toEqual({ ok: true });
  });

  it("accepts a sentence with no numbers", () => {
    expect(checkNumbers("GLS is a small sample.", FACTS)).toEqual({ ok: true });
  });

  it("rejects a number computation did not produce", () => {
    expect(checkNumbers("17 orders were delivered late.", FACTS)).toEqual({ ok: false, reason: 'the number "17" is not in the facts' });
  });

  it("rejects a number formatted differently from the facts", () => {
    expect(checkNumbers("GLS is at 25% delayed.", FACTS).ok).toBe(false);
    expect(checkNumbers("1310 units were ordered.", FACTS).ok).toBe(false);
    expect(checkNumbers("1,310 units were ordered.", FACTS).ok).toBe(true);
  });

  it('rejects numbers in words: "three"', () => {
    expect(checkNumbers("Three orders were delivered late.", FACTS)).toEqual({ ok: false, reason: 'the number word "Three"' });
  });

  it('rejects multipliers: "twice", "half"', () => {
    expect(checkNumbers("GLS is late twice as often as USPS.", FACTS)).toEqual({ ok: false, reason: 'the number word "twice"' });
    expect(checkNumbers("Half of the orders were late.", FACTS).ok).toBe(false);
  });

  it("rejects multipliers written with digits or as verbs and fractions: 2x, 8 times, doubled, twofold, a quarter of, zero", () => {
    for (const sentence of [
      "GLS is late 2x as often.",
      "GLS is 8 times worse.",
      "Delays doubled in November.",
      "Orders halved after January.",
      "A twofold rise.",
      "A quarter of the orders were late.",
      "Zero orders were lost.",
    ]) {
      expect(checkNumbers(sentence, FACTS).ok, sentence).toBe(false);
    }
  });

  it("still accepts a quarter as a period", () => {
    expect(checkNumbers("Most orders came in the last quarter.", FACTS)).toEqual({ ok: true });
  });

  it("does not mistake words that contain a number word for one", () => {
    expect(checkNumbers("None of the orders were lost; someone may ask often.", FACTS)).toEqual({ ok: true });
  });
});

describe("the wording of a forecast sentence (ADR 0003 §7, ticket 23)", () => {
  const Q2 = { target: { labels: ["Q2 2026", "Apr–Jun 2026"], units: "285" } };

  it("rejects the plan read as an order to place", () => {
    expect(checkForecastWording("Reorder 405 units for Jan–Mar 2026.", {}).ok).toBe(false);
    expect(checkForecastWording("There are 405 units to plan for over Jan–Mar 2026.", {})).toEqual({ ok: true });
  });

  it("requires the SKU as the data writes it, and only that way", () => {
    const sku = { skuId: "CRAYON-0008" };
    expect(checkForecastWording("CRAYON-0008 cannot be forecast on its own.", sku)).toEqual({ ok: true });
    expect(checkForecastWording("crayon-0008 cannot be forecast on its own.", sku).ok).toBe(false);
    expect(checkForecastWording("crayon-0008 (CRAYON-0008) cannot be forecast on its own.", sku).ok).toBe(false);
  });

  it("requires the demand in the months asked about, as a whole number beside their name", () => {
    expect(checkForecastWording("In Q2 2026, demand is forecast at 285 units; plan for 739 units through Jun 2026.", Q2)).toEqual({ ok: true });
    expect(checkForecastWording("Over Jan–Jun 2026, demand is forecast at 570 units; that is 739 units to plan for.", Q2).ok).toBe(false);
  });

  it('does not find the demand inside another number, nor the month at the end of a range: "3" in "33", "Feb 2026" in "Jan–Feb 2026"', () => {
    const feb = { target: { labels: ["Feb 2026"], units: "3" } };
    expect(checkForecastWording("Over Jan–Feb 2026, plan for 33 units.", feb).ok).toBe(false);
    expect(checkForecastWording("In Feb 2026, demand is forecast at 3 units; over Jan–Feb 2026, plan for 33 units.", feb)).toEqual({ ok: true });
  });
});
