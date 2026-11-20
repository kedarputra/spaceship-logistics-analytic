/**
 * How a chart lays out values it was given: which bars carry a label, and where the value axis
 * ends. Presentation only; every value arrives computed.
 */

/** The bars at the highest and the lowest value, ties included: the only ones labelled. */
export function extremeIndexes(values: readonly number[]): Set<number> {
  if (values.length === 0) return new Set();
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  return new Set(values.flatMap((value, index) => (value === highest || value === lowest ? [index] : [])));
}

const ROUND_STEPS = [1, 2, 2.5, 5, 10];

/** An axis from 0 to `max` rounded up, in about `tickCount` round steps: 75 → 0, 20, 40, 60, 80. */
export function niceScale(max: number, tickCount = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const rough = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = (ROUND_STEPS.find((candidate) => candidate * magnitude >= rough) ?? 10) * magnitude;
  const steps = Math.ceil(max / step - 1e-9);
  const ticks = Array.from({ length: steps + 1 }, (_, index) => Number((index * step).toPrecision(12)));
  return { max: ticks.at(-1) ?? max, ticks };
}
