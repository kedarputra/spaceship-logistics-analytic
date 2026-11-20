import type { ReactNode } from "react";
import type { BucketValue, DeliveryOutcomes } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import { extremeIndexes, niceScale } from "./scale";
import { OUTCOME_SERIES } from "./series";

/**
 * The Overview's two month charts (ADR 0011 §3, ticket 24), drawn as plain HTML so they render on the
 * server: orders per month, with only the highest and lowest bars labelled, and delivery outcomes
 * per month, stacked with a 2 px gap between segments. Every value shown arrives computed; the stacks
 * are summed only to size the axis.
 */

/** "Jan 2025" → "Jan" for the axis; the caption gives the year and the table keeps the full label. */
function monthOnly(label: string): string {
  return label.replace(/ \d{4}$/, "");
}

const PLOT_HEIGHT = "h-[210px]";

/** The grid, its value ticks and the month labels, with one column per month laid over it. */
function Plot({ ticks, max, months, description, children }: { ticks: number[]; max: number; months: string[]; description: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={description} className="@container">
      <div className={`relative mt-4 ml-[30px] ${PLOT_HEIGHT}`}>
        {ticks.map((tick) => (
          <div key={tick} className={`absolute inset-x-0 border-t ${tick === 0 ? "border-axis" : "border-grid"}`} style={{ bottom: `${(tick / max) * 100}%` }}>
            <span className="absolute -top-2 -left-[30px] w-6 text-right text-axis text-muted">{formatCount(tick)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-1.5 px-1">{children}</div>
      </div>
      <div className="mt-1.5 ml-[30px] flex gap-1.5 px-1">
        {months.map((month) => (
          <span key={month} className="flex-1 text-center text-axis text-muted">
            {/* A narrow chart has no room for "Jan" under each bar: it shows "J". */}
            <span className="@max-sm:hidden">{month}</span>
            <span className="@sm:hidden">{month.charAt(0)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const percentOf = (value: number, max: number) => `${(value / max) * 100}%`;

/** Orders per month as bars, a value label on the highest and the lowest only. */
export function OrderBars({ months }: { months: readonly BucketValue<number>[] }) {
  const values = months.map(({ value }) => value);
  const { max, ticks } = niceScale(Math.max(0, ...values));
  const labelled = extremeIndexes(values);
  return (
    <Plot ticks={ticks} max={max} months={months.map(({ bucket }) => monthOnly(bucket.label))} description="Orders per month, as bars. The data table lists every value.">
      {months.map(({ bucket, value }, index) => (
        <div key={bucket.key} title={`${bucket.label}: ${formatCount(value)} orders`} className="flex h-full flex-1 flex-col items-center justify-end">
          {labelled.has(index) ? (
            <span data-bar-label={formatCount(value)} className="mb-1 text-axis leading-none font-bold">
              {formatCount(value)}
            </span>
          ) : null}
          <div className="w-[64%] max-w-[30px] rounded-t bg-mark-on-time" style={{ height: percentOf(value, max) }} />
        </div>
      ))}
    </Plot>
  );
}

/** The segments of one month, top to bottom: the outcomes in reverse, so on time sits on the axis. */
const SEGMENTS = OUTCOME_SERIES.toReversed();

/** Delivery outcomes per month, stacked, with a 2 px gap between segments; only the top segment is rounded. */
export function OutcomeBars({ months }: { months: readonly BucketValue<DeliveryOutcomes>[] }) {
  const stackHeights = months.map(({ value }) => SEGMENTS.reduce((height, { key }) => height + value[key], 0));
  const { max, ticks } = niceScale(Math.max(0, ...stackHeights));
  return (
    <Plot
      ticks={ticks}
      max={max}
      months={months.map(({ bucket }) => monthOnly(bucket.label))}
      description="Delivery outcomes per month, as stacked bars: on time, delayed and exception. The data table lists every value."
    >
      {months.map(({ bucket, value }) => {
        const present = SEGMENTS.filter(({ key }) => value[key] > 0);
        const tip = `${bucket.label}: ${OUTCOME_SERIES.map(({ key, label }) => `${formatCount(value[key])} ${label.toLowerCase()}`).join(" · ")}`;
        return (
          <div key={bucket.key} title={tip} className="flex h-full flex-1 justify-center">
            <div className="flex h-full w-[64%] max-w-[30px] flex-col justify-end gap-[2px]">
              {present.map(({ key, mark }, segment) => (
                <div key={key} className={`${mark} ${segment === 0 ? "rounded-t" : ""}`} style={{ height: percentOf(value[key], max) }} />
              ))}
            </div>
          </div>
        );
      })}
    </Plot>
  );
}
