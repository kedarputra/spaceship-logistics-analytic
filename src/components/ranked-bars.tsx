import { niceScale } from "./scale";
import type { Tone } from "./series";
import { Tag } from "./tag";

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
  /** A line under the name, such as "n=71 · 81.7% on time". */
  detail?: string;
}

/** The marks of each tone as classes; palette.ts holds the same colours for Recharts. */
const FILLS: Record<Tone, { normal: string; small: string }> = {
  amber: { normal: "bg-mark-delayed", small: "bg-mark-small shadow-[inset_0_0_0_1px_var(--color-mark-delayed)]" },
  green: { normal: "bg-mark-on-time", small: "bg-sage" },
};

const NAME_COLUMN = "w-[min(156px,42%)] shrink-0";
const VALUE_COLUMN = "w-16 shrink-0 text-right";

/**
 * Groups ranked as horizontal bars (ADR 0011 §3), each with its name, n and value as text, and a
 * "small sample" tag where it applies, so a lighter bar is never the only sign. `formatTick` adds the
 * value axis under the bars.
 */
export function RankedBars({ bars, tone, formatTick }: { bars: readonly RankedBar[]; tone: Tone; formatTick?: (value: number) => string }) {
  const { max, ticks } = niceScale(Math.max(0, ...bars.map(({ value }) => value ?? 0)));
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex flex-col gap-2.5">
        {bars.map((bar) => (
          <li key={bar.label} className="flex items-center gap-3">
            <span className={`flex flex-col text-small ${NAME_COLUMN}`}>
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span className="font-semibold">{bar.label}</span>
                {bar.n === undefined ? null : <span className="text-muted">{`n=${bar.n}`}</span>}
                {bar.smallSample ? <Tag tone="warn">small sample</Tag> : null}
                {bar.tag === undefined ? null : <Tag tone="neutral">{bar.tag}</Tag>}
              </span>
              {bar.detail === undefined ? null : <span className="text-note text-muted">{bar.detail}</span>}
            </span>
            <span aria-hidden="true" className="h-4 flex-auto rounded bg-track">
              <span
                className={`block h-full min-w-[2px] rounded ${bar.smallSample ? FILLS[tone].small : FILLS[tone].normal}`}
                style={{ width: `${((bar.value ?? 0) / max) * 100}%` }}
              />
            </span>
            <span className={`text-small font-semibold ${VALUE_COLUMN}`}>{bar.valueText}</span>
          </li>
        ))}
      </ol>
      {formatTick === undefined ? null : (
        <div aria-hidden="true" className="flex items-center gap-3 text-tick text-muted">
          <span className={NAME_COLUMN} />
          <span className="flex flex-auto justify-between">
            {ticks.map((tick) => (
              <span key={tick}>{formatTick(tick)}</span>
            ))}
          </span>
          <span className={VALUE_COLUMN} />
        </div>
      )}
    </div>
  );
}
