"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount, formatDecimal } from "@/domain/format";
import { type ChartTipContent, rowTipContent } from "./chart-tip";
import { BAND_OPACITY, CHART_INK, MARKS } from "./palette";

/** One month on the chart: units ordered, or the forecast and its 95% range. */
export interface ForecastChartRow {
  label: string;
  history: number | null;
  forecast: number | null;
  range: [number, number] | null;
}

const HEIGHT = 280;
const TICK = { fill: CHART_INK.label, fontSize: 12 };
const DEMAND = MARKS.onTime;

/**
 * A month's tooltip (ticket 26), in whole units as a plan is read: the units ordered, or the forecast
 * and its 95% range, "13–177 units". The last month of history, where the forecast line starts, reads
 * its units ordered once.
 */
export function forecastTip(row: ForecastChartRow): ChartTipContent {
  const units = (value: number) => formatDecimal(value, 0);
  const ordered = row.history === null ? [] : [{ value: `${formatCount(row.history)} units`, name: "ordered", color: DEMAND }];
  const ahead =
    row.range === null || row.forecast === null
      ? []
      : [
          { value: `${units(row.forecast)} units`, name: "forecast", color: MARKS.forecastLine },
          { value: `${units(row.range[0])}–${units(row.range[1])} units`, name: "95% range", color: MARKS.band },
        ];
  return { heading: row.label, rows: [...ordered, ...ahead] };
}

/** History, a dashed forecast from the last month, and the shaded 95% range (ADR 0003 §8, ADR 0011 §3). All values arrive computed. */
export function ForecastChart({ rows }: { rows: ForecastChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="label" interval="preserveStartEnd" tick={TICK} stroke={CHART_INK.axis} />
        <YAxis allowDecimals={false} tickFormatter={formatCount} tick={TICK} stroke={CHART_INK.axis} />
        <Tooltip content={rowTipContent(rows, forecastTip)} />
        <Legend
          itemSorter={null}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: CHART_INK.label }}>{value}</span>}
        />
        <Area name="95% range" dataKey="range" fill={MARKS.band} fillOpacity={BAND_OPACITY} stroke="none" legendType="square" isAnimationActive={false} />
        <Line
          name="Units ordered"
          dataKey="history"
          stroke={DEMAND}
          strokeWidth={2}
          legendType="plainline"
          dot={{ r: 4, fill: DEMAND, stroke: CHART_INK.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          name="Forecast"
          dataKey="forecast"
          stroke={MARKS.forecastLine}
          strokeWidth={2}
          strokeDasharray="6 4"
          // The legend's line keeps the dash, so the forecast is told apart by more than its label.
          legendType="plainline"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
