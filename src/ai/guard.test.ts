import { describe, expect, it } from "vitest";
import { checkNumbers } from "./guard";

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
