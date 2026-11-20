import { niceScale } from "./scale";
import type { Tone } from "./series";

/** One ranked group: its name, n, value and value as text. */
export interface RankedBar {
  label: string;
  /** Delivered orders behind a rate or an average, shown as n. */
  n?: number;
  value: number | null;
  valueText: string;
  smallSample?: boolean;
  /** A note beside the name, such as "first with n ≥ 20". */
  tag?: string;
}

/** The marks of each tone as classes; palette.ts holds the same colours for Recharts. */
const FILLS: Record<Tone, { normal: string; small: string }> = {
  amber: { normal: "bg-mark-delayed", small: "bg-mark-small shadow-[inset_0_0_0_1px_var(--color-mark-delayed)]" },
  green: { normal: "bg-mark-on-time", small: "bg-sage" },
};

/**
 * Groups ranked as horizontal bars (ADR 0011 §3), each with its name, n and value as text, and a
 * "small sample" tag where it applies, so a lighter bar is never the only sign.
 */
export function RankedBars({ bars, tone }: { bars: readonly RankedBar[]; tone: Tone }) {
  const { max } = niceScale(Math.max(0, ...bars.map(({ value }) => value ?? 0)));
  return (
    <ol className="flex flex-col gap-2.5">
      {bars.map((bar) => (
        <li key={bar.label} className="flex items-center gap-3">
          <span className="flex w-[min(156px,42%)] shrink-0 flex-wrap items-center gap-x-1.5 text-small">
            <span className="font-semibold">{bar.label}</span>
            {bar.n === undefined ? null : <span className="text-muted">{`n=${bar.n}`}</span>}
            {bar.smallSample ? <span className="rounded bg-warn-tint px-1.5 py-px text-label tracking-normal text-warn-ink normal-case">small sample</span> : null}
            {bar.tag === undefined ? null : <span className="rounded bg-track px-1.5 py-px text-label tracking-normal text-ink-2 normal-case">{bar.tag}</span>}
          </span>
          <span aria-hidden="true" className="h-4 flex-auto rounded bg-track">
            <span
              className={`block h-full min-w-[2px] rounded ${bar.smallSample ? FILLS[tone].small : FILLS[tone].normal}`}
              style={{ width: `${((bar.value ?? 0) / max) * 100}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-small font-semibold">{bar.valueText}</span>
        </li>
      ))}
    </ol>
  );
}
