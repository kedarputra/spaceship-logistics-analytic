import type { ReactNode } from "react";
import { Tag } from "./tag";

/**
 * The one tooltip look every chart shares (ticket 26): the hand-drawn month charts and the Recharts
 * charts of the Ask answer and the Forecast. It only repeats values the chart's Data table holds.
 */

/** One series in a tooltip: its value as text, its name, and its mark's colour. */
export interface TipRow {
  value: string;
  name: string;
  color: string;
}

/** What a tooltip shows for one month or group. Every value arrives computed and formatted. */
export interface ChartTipContent {
  /** The full month, "Jun 2025", or the group's name. */
  heading: string;
  /** One per series, in legend order. */
  rows: readonly TipRow[];
  /** A line under the rows: "15 of 18 delivered on time". */
  note?: string;
  smallSample?: boolean;
}

/** The tooltip in words, for a screen reader: "Jun 2025: 83.3% on time, 15 of 18 delivered on time, small sample". */
export function tipText(tip: ChartTipContent): string {
  const parts = [...tip.rows.map(({ value, name }) => `${value} ${name}`), ...(tip.note === undefined ? [] : [tip.note]), ...(tip.smallSample ? ["small sample"] : [])];
  return `${tip.heading}: ${parts.join(", ")}`;
}

/**
 * A Recharts tooltip's content: the tooltip of the row under the pointer, found by its label, or
 * nothing when the pointer is off the chart.
 */
export function rowTipContent<Row extends { label: string }>(rows: readonly Row[], tipOf: (row: Row) => ChartTipContent) {
  return function RowTip({ active, label }: { active?: boolean; label?: string | number }): ReactNode {
    const row = active === true ? rows.find((candidate) => candidate.label === label) : undefined;
    return row === undefined ? null : <ChartTip tip={tipOf(row)} />;
  };
}

/**
 * A small card on the panel surface: the heading, then one row per series with the value in bold ink
 * before the series name, keyed by a short stroke of the series colour. `foot` says what a click opens.
 */
export function ChartTip({ tip, foot }: { tip: ChartTipContent; foot?: string }) {
  // At most 220 px, and on a narrow screen no wider than the room right of a Recharts y-axis inside
  // its card (Recharts keeps a tooltip right of the axis), so the series name wraps instead.
  return (
    <div className="w-max max-w-[min(220px,calc(100vw-120px))] rounded-card border border-line bg-panel px-3 py-2.5 text-small shadow-raised">
      <p className="font-semibold text-ink">{tip.heading}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {tip.rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-[3px] w-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="font-bold text-ink">{row.value}</span>
            <span className="text-muted">{row.name}</span>
          </li>
        ))}
      </ul>
      {tip.note === undefined ? null : <p className="mt-0.5 text-muted">{tip.note}</p>}
      {tip.smallSample ? (
        <p className="mt-1.5">
          <Tag tone="warn">small sample</Tag>
        </p>
      ) : null}
      {foot === undefined ? null : <p className="mt-2 border-t border-grid pt-1.5 text-note font-semibold text-green-text">{foot}</p>}
    </div>
  );
}
