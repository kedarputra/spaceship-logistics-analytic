"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCount, formatPercent } from "@/domain/format";
import type { ChartType } from "@/tools/chart";
import { CHART_INK } from "./palette";

/** The chart types the dashboard draws. The answer view (ADR 0006 §6) adds the line and the answer card. */
export type BarChartType = Extract<ChartType, "vertical-bars" | "stacked-bars" | "horizontal-bars">;

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  /** The fill for rows marked muted, such as small samples. */
  mutedColor?: string;
}

export interface ChartRow {
  label: string;
  values: Record<string, number | null>;
  /** Drawn lighter: a small sample (ADR 0001 §6). */
  muted?: boolean;
}

export type ValueFormat = "count" | "percent";

export interface ChartProps {
  type: BarChartType;
  series: ChartSeries[];
  rows: ChartRow[];
  valueFormat: ValueFormat;
}

const HEIGHT = 280;
const ROW_HEIGHT = 32;
const BAR_SIZE = 24;
const TICK = { fill: CHART_INK.label, fontSize: 12 };

// Values as everywhere else in the UI (ADR 0001 §7); axis ticks drop a trailing ".0" ("5%", not "5.0%").
const FORMATS: Record<ValueFormat, { value: (value: number) => string; tick: (value: number) => string }> = {
  count: { value: formatCount, tick: formatCount },
  percent: { value: formatPercent, tick: (value) => `${Number((value * 100).toFixed(1))}%` },
};

function seriesValue(row: ChartRow, key: string): number | null {
  return row.values[key] ?? null;
}

function assertNever(type: never): never {
  throw new Error(`No renderer for chart type ${String(type)}`);
}

/** Draws the chart type that chooseChart picked (ADR 0006 §6). All values arrive computed. */
export function Chart({ type, series, rows, valueFormat }: ChartProps) {
  const format = FORMATS[valueFormat];
  const labelText = (value: unknown) => (typeof value === "number" ? format.value(value) : String(value));
  const tooltip = (
    <Tooltip formatter={labelText} itemSorter={(item) => series.findIndex(({ label }) => label === item.name)} />
  );
  // A legend for two or more series, in series order, its text in ink rather than the series color.
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
    case "horizontal-bars":
      return (
        <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 40}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
            <XAxis type="number" tickCount={6} tickFormatter={format.tick} tick={TICK} stroke={CHART_INK.axis} />
            <YAxis type="category" dataKey="label" width={140} tick={TICK} stroke={CHART_INK.axis} />
            {tooltip}
            {legend}
            {series.map((item) => (
              <Bar
                key={item.key}
                name={item.label}
                dataKey={(row: ChartRow) => seriesValue(row, item.key)}
                fill={item.color}
                barSize={BAR_SIZE}
                radius={[0, 4, 4, 0]}
                // A 0% bar keeps a sliver, so its row still shows a bar and a "0.0%" label.
                minPointSize={2}
                isAnimationActive={false}
              >
                {rows.map((row) => (
                  <Cell key={row.label} fill={row.muted ? (item.mutedColor ?? item.color) : item.color} />
                ))}
                <LabelList position="right" fill={CHART_INK.label} fontSize={12} formatter={labelText} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case "vertical-bars":
    case "stacked-bars": {
      const stacked = type === "stacked-bars";
      return (
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
            <XAxis dataKey="label" interval="preserveStartEnd" tick={TICK} stroke={CHART_INK.axis} />
            <YAxis allowDecimals={false} tickFormatter={format.tick} tick={TICK} stroke={CHART_INK.axis} />
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
                // A white edge leaves a gap between stacked segments; only the top segment is rounded.
                stroke={stacked ? "#ffffff" : undefined}
                radius={!stacked || index === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    default:
      return assertNever(type);
  }
}
