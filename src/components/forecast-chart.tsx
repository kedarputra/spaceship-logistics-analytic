"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount, formatDecimal } from "@/domain/format";
import { CHART_INK, RANGE_BLUE, SERIES_COLORS } from "./palette";

/** One month on the chart: units ordered, or the forecast and its 95% range. */
export interface ForecastChartRow {
  label: string;
  history: number | null;
  forecast: number | null;
  range: [number, number] | null;
}

const HEIGHT = 280;
const TICK = { fill: CHART_INK.label, fontSize: 12 };
const DEMAND = SERIES_COLORS.blue;

/** "95.0", or "13.4–176.6" for the range. */
function tooltipValue(value: unknown): string {
  if (typeof value === "number") return formatDecimal(value);
  if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
    return `${formatDecimal(value[0])}–${formatDecimal(value[1])}`;
  }
  return String(value);
}

/** History, a dashed forecast from the last month, and the shaded 95% range (ADR 0003 §8). All values arrive computed. */
export function ForecastChart({ rows }: { rows: ForecastChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="label" interval="preserveStartEnd" tick={TICK} stroke={CHART_INK.axis} />
        <YAxis allowDecimals={false} tickFormatter={formatCount} tick={TICK} stroke={CHART_INK.axis} />
        <Tooltip formatter={tooltipValue} />
        <Legend
          itemSorter={null}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => <span style={{ color: CHART_INK.label }}>{value}</span>}
        />
        <Area name="95% range" dataKey="range" fill={RANGE_BLUE} fillOpacity={1} stroke="none" legendType="square" isAnimationActive={false} />
        <Line
          name="Units ordered"
          dataKey="history"
          stroke={DEMAND}
          strokeWidth={2}
          legendType="plainline"
          dot={{ r: 4, fill: DEMAND, stroke: "#ffffff", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          name="Forecast"
          dataKey="forecast"
          stroke={DEMAND}
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
