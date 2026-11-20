"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetricDefinition } from "@/domain/definitions";
import { formatCount, formatMetricValue } from "@/domain/format";
import type { ChartType } from "@/tools/chart";
import { CHART_INK } from "./palette";

/** The chart types drawn by Recharts. An answer card is a number, and horizontal bars are RankedBars. */
export type DrawnChartType = Exclude<ChartType, "answer-card" | "horizontal-bars">;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  /** The fill for rows marked muted, such as small samples. */
  mutedColor?: string;
  /** A 1 px ring around a muted mark, where its fill alone is too light (ADR 0011 §3). */
  mutedRing?: string;
}

export interface ChartRow {
  label: string;
  values: Record<string, number | null>;
  /** Drawn lighter: a small sample (ADR 0001 §6). */
  muted?: boolean;
}

/** The unit of the values, as METRICS names it. */
export type ValueFormat = MetricDefinition["unit"];

export interface ChartProps {
  type: DrawnChartType;
  series: ChartSeries[];
  rows: ChartRow[];
  valueFormat: ValueFormat;
}

const HEIGHT = 280;
const BAR_SIZE = 24;
const TICK = { fill: CHART_INK.label, fontSize: 12 };

// Axis ticks drop a trailing ".0" ("5%", not "5.0%"); values read as everywhere else in the UI (ADR 0001 §7).
function tickFormatter(unit: ValueFormat): (value: number) => string {
  if (unit === "percent") return (value) => `${Number((value * 100).toFixed(1))}%`;
  if (unit === "days") return (value) => `${Number(value.toFixed(1))}`;
  return formatCount;
}

function seriesValue(row: ChartRow, key: string): number | null {
  return row.values[key] ?? null;
}

function assertNever(type: never): never {
  throw new Error(`No renderer for chart type ${String(type)}`);
}

/** Draws the chart type that chooseChart picked (ADR 0006 §6) in the marks of ADR 0011 §3. All values arrive computed. */
export function Chart({ type, series, rows, valueFormat }: ChartProps) {
  const formatTick = tickFormatter(valueFormat);
  const labelText = (value: unknown) => (typeof value === "number" ? formatMetricValue(value, valueFormat) : String(value));
  const tooltip = <Tooltip formatter={labelText} itemSorter={(item) => series.findIndex(({ label }) => label === item.name)} />;
  // A legend for two or more series, in series order, its text in ink rather than the series colour.
  const legend =
    series.length > 1 ? (
      <Legend
        iconType="square"
        itemSorter={null}
        wrapperStyle={{ fontSize: 12 }}
        formatter={(value) => <span style={{ color: CHART_INK.label }}>{value}</span>}
      />
    ) : null;

  switch (type) {
    case "vertical-bars":
    case "stacked-bars": {
      const stacked = type === "stacked-bars";
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
            <XAxis dataKey="label" interval="preserveStartEnd" tick={TICK} stroke={CHART_INK.axis} />
            <YAxis allowDecimals={false} tickFormatter={formatTick} tick={TICK} stroke={CHART_INK.axis} />
            {tooltip}
            {legend}
            {series.map((item, index) => (
              <Bar
                key={item.key}
                name={item.label}
                dataKey={(row: ChartRow) => seriesValue(row, item.key)}
                fill={item.color}
                barSize={BAR_SIZE}
                stackId={stacked ? "stack" : undefined}
                // A 2 px edge in the card's colour leaves a 2 px gap between stacked segments; only the top one is rounded.
                stroke={stacked ? CHART_INK.surface : undefined}
                strokeWidth={stacked ? 2 : 0}
                radius={!stacked || index === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              >
                {stacked
                  ? null
                  : rows.map((row) => (
                      <Cell
                        key={row.label}
                        fill={row.muted ? (item.mutedColor ?? item.color) : item.color}
                        stroke={row.muted ? item.mutedRing : undefined}
                        strokeWidth={row.muted && item.mutedRing !== undefined ? 1 : 0}
                      />
                    ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    case "line":
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
            <XAxis dataKey="label" interval="preserveStartEnd" tick={TICK} stroke={CHART_INK.axis} />
            <YAxis tickCount={6} tickFormatter={formatTick} tick={TICK} stroke={CHART_INK.axis} />
            {tooltip}
            {legend}
            {series.map((item) => (
              <Line
                key={item.key}
                name={item.label}
                dataKey={(row: ChartRow) => seriesValue(row, item.key)}
                stroke={item.color}
                strokeWidth={2}
                // Small-sample points are drawn lighter, ringed in the series colour.
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const muted = rows[props.index ?? 0]?.muted === true;
                  return (
                    <circle
                      key={`${item.key}-${props.index ?? 0}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={muted ? 4.5 : 4}
                      fill={muted ? (item.mutedColor ?? item.color) : item.color}
                      stroke={muted ? item.color : CHART_INK.surface}
                      strokeWidth={muted ? 1.5 : 2}
                    />
                  );
                }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    default:
      return assertNever(type);
  }
}
