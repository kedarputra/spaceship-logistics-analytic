import type { ReactNode } from "react";
import { type BucketValue, type DeliveryOutcomes, METRIC_STATUSES } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import { lowered } from "@/tools/words";
import { monthOrdersLink } from "./card-link";
import type { Slack } from "./chart-hover";
import { MonthHover, type MonthTip } from "./month-hover";
import { MARKS } from "./palette";
import { extremeIndexes, niceScale } from "./scale";
import { OUTCOME_SERIES } from "./series";

/**
 * The Overview's two month charts (ADR 0011 §3, ticket 24), drawn as plain HTML so they render on the
 * server: orders per month, with only the highest and lowest bars labelled, and delivery outcomes
 * per month, stacked with a 2 px gap between segments. Every value shown arrives computed; the stacks
 * are summed only to size the axis. Pointing at a month shows its values, and a click opens its
 * orders (ticket 26).
 */

/** "Jan 2025" → "Jan" for the axis; the caption gives the year and the table keeps the full label. */
export function monthOnly(label: string): string {
  return label.replace(/ \d{4}$/, "");
}

const PLOT_HEIGHT = "h-[210px]";

/** How far the card reaches past the months: the tick gutter (34 px) and the plot's inset (4 px) on the left, the inset on the right. */
const PLOT_SLACK: Slack = { left: 38, right: 4 };

interface PlotProps {
  ticks: number[];
  /** The value at the bottom of the plot: 0 for bars, which must start at 0. */
  min?: number;
  max: number;
  months: string[];
  description: string;
  formatTick?: (value: number) => string;
  /** Each month's tooltip and orders, and its mark, in month order. */
  tips: readonly MonthTip[];
  marks: readonly ReactNode[];
  /** A hairline through the month shown, for a line. */
  crosshair?: boolean;
  /** Drawn under the months, across the plot: the line. */
  children?: ReactNode;
}

/**
 * The grid, its value ticks and the month labels, in HTML so the text keeps its size at any width;
 * the months are laid over it side by side, each the full height of the plot. Shared by the month
 * bars here and the rate line.
 */
export function Plot({ ticks, min = 0, max, months, description, formatTick = formatCount, tips, marks, crosshair, children }: PlotProps) {
  return (
    <div className="@container">
      <div className={`relative mt-4 ml-[34px] ${PLOT_HEIGHT}`}>
        {ticks.map((tick) => (
          <div key={tick} className={`absolute inset-x-0 border-t ${tick === min ? "border-axis" : "border-grid"}`} style={{ bottom: `${((tick - min) / (max - min)) * 100}%` }}>
            <span aria-hidden="true" className="absolute -top-2 -left-[34px] w-7 text-right text-tick text-muted">
              {formatTick(tick)}
            </span>
          </div>
        ))}
        <MonthHover description={description} tips={tips} marks={marks} crosshair={crosshair} slack={PLOT_SLACK}>
          {children}
        </MonthHover>
      </div>
      <div aria-hidden="true" className="mt-1.5 ml-[34px] flex px-1">
        {months.map((month) => (
          <span key={month} className="flex-1 text-center text-tick text-muted">
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

/** A bar's lift while its month is shown (ticket 26): a slight lightening. */
const LIFT = "transition-[filter] group-data-active/month:brightness-[1.18]";

/** Orders per month as bars, a value label on the highest and the lowest only. Each month opens its orders by order date. */
export function OrderBars({ months }: { months: readonly BucketValue<number>[] }) {
  const values = months.map(({ value }) => value);
  const { max, ticks } = niceScale(Math.max(0, ...values));
  const labelled = extremeIndexes(values);
  return (
    <Plot
      ticks={ticks}
      max={max}
      months={months.map(({ bucket }) => monthOnly(bucket.label))}
      description="Orders per month, as bars. The data table lists every value."
      tips={months.map(({ bucket, value }) => ({
        heading: bucket.label,
        rows: [{ value: formatCount(value), name: "orders", color: MARKS.onTime }],
        link: monthOrdersLink(value, "orders", bucket.key, "order"),
      }))}
      marks={months.map(({ value }, index) => (
        <div className="flex h-full w-full flex-col items-center justify-end">
          {labelled.has(index) ? (
            <span data-bar-label={formatCount(value)} className="mb-1 text-tick leading-none font-bold text-ink">
              {formatCount(value)}
            </span>
          ) : null}
          <div className={`w-[64%] max-w-[30px] rounded-t bg-mark-on-time ${LIFT}`} style={{ height: percentOf(value, max) }} />
        </div>
      ))}
    />
  );
}

/** The segments of one month, top to bottom: the outcomes in reverse, so on time sits on the axis. */
const SEGMENTS = OUTCOME_SERIES.toReversed();

/** A month's delivery outcomes, and its delivered orders as the delivered orders metric counts them. */
export type MonthOutcomes = BucketValue<DeliveryOutcomes> & { delivered: number };

/**
 * Delivery outcomes per month, stacked, with a 2 px gap between segments; only the top segment is
 * rounded. Each month opens its delivered orders by delivery date, as many as the metric counts: the
 * tooltip never sums the outcomes (ADR 0011 §6).
 */
export function OutcomeBars({ months }: { months: readonly MonthOutcomes[] }) {
  const stackHeights = months.map(({ value }) => SEGMENTS.reduce((height, { key }) => height + value[key], 0));
  const { max, ticks } = niceScale(Math.max(0, ...stackHeights));
  return (
    <Plot
      ticks={ticks}
      max={max}
      months={months.map(({ bucket }) => monthOnly(bucket.label))}
      description="Delivery outcomes per month, as stacked bars: on time, delayed and exception. The data table lists every value."
      tips={months.map(({ bucket, value, delivered }) => ({
        heading: bucket.label,
        rows: OUTCOME_SERIES.map(({ key, label, color }) => ({ value: formatCount(value[key]), name: lowered(label), color })),
        link: monthOrdersLink(delivered, "delivered orders", bucket.key, "delivery", { status: METRIC_STATUSES.delivered_orders }),
      }))}
      marks={months.map(({ value }) => (
        <div className="flex h-full w-[64%] max-w-[30px] flex-col justify-end gap-[2px]">
          {SEGMENTS.filter(({ key }) => value[key] > 0).map(({ key, mark }, segment) => (
            <div key={key} className={`${mark} ${segment === 0 ? "rounded-t" : ""} ${LIFT}`} style={{ height: percentOf(value[key], max) }} />
          ))}
        </div>
      ))}
    />
  );
}
