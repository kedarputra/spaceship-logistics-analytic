"use client";

import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount, formatPercent, formatPercentPlain } from "@/domain/format";
import { ChartTip, type ChartTipContent } from "./chart-tip";
import { ABC_MARKS, AREA_OPACITY, CHART_INK } from "./palette";

type AbcClass = keyof typeof ABC_MARKS;
/** The ABC classes' letters, in order: domain/definitions' ABC_CLASSES, without loading it in the browser. */
const CLASSES: readonly AbcClass[] = ["A", "B", "C"];

/** One SKU on the curve: its rank by value, its class, its value as the table writes it, and the share of value up to it. */
export interface ParetoPoint {
  rank: number;
  sku: string;
  abcClass: AbcClass;
  valueText: string;
  cumulativeShare: number;
}

const HEIGHT = 280;
const TICK = { fill: CHART_INK.label, fontSize: 12 };

/** A point's tooltip (ticket 26's look): the SKU, the share of value up to it in its class's colour, and its class, rank and value. */
export function paretoTip(point: ParetoPoint, skus: number): ChartTipContent {
  return {
    heading: point.sku,
    rows: [{ value: formatPercent(point.cumulativeShare), name: "of value so far", color: ABC_MARKS[point.abcClass] }],
    note: `Class ${point.abcClass} · #${formatCount(point.rank)} of ${formatCount(skus)} · ${point.valueText}`,
  };
}

/**
 * Each class's share at the points it covers, and at the last point before it, so the line runs on
 * unbroken where the colour changes. Elsewhere null, so each class is its own stretch of line and wash.
 */
function chartRows(points: readonly ParetoPoint[]): ({ rank: number } & Record<AbcClass, number | null>)[] {
  return points.map((point, index) => {
    const next = points[index + 1];
    const row = { rank: point.rank, A: null, B: null, C: null, [point.abcClass]: point.cumulativeShare };
    return next === undefined || next.abcClass === point.abcClass ? row : { ...row, [next.abcClass]: point.cumulativeShare };
  });
}

/** Where each class starts and ends on the rank axis, for its letter. */
function classRanges(points: readonly ParetoPoint[]): { abcClass: AbcClass; first: number; last: number }[] {
  return CLASSES.flatMap((abcClass) => {
    const ranks = points.filter((point) => point.abcClass === abcClass).map(({ rank }) => rank);
    const [first, last] = [ranks[0], ranks.at(-1)];
    return first === undefined || last === undefined ? [] : [{ abcClass, first, last }];
  });
}

/**
 * The Pareto curve (ticket 33): the share of all value against the SKUs ranked by value, highest first.
 * Each class's stretch is drawn in its mark with a wash under it and its letter at its foot, so a class
 * is never told by colour alone; the class limits are dashed lines. All values arrive computed.
 */
export function ParetoChart({ points, limits }: { points: readonly ParetoPoint[]; limits: readonly number[] }) {
  const rows = chartRows(points);
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
        <XAxis
          dataKey="rank"
          type="number"
          domain={[1, points.length]}
          tick={TICK}
          stroke={CHART_INK.axis}
          tickFormatter={formatCount}
          height={40}
          label={{ value: "SKUs, highest value first", position: "insideBottom", offset: 0, fill: CHART_INK.label, fontSize: 12 }}
        />
        <YAxis domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={formatPercentPlain} tick={TICK} stroke={CHART_INK.axis} width={44} />
        <Tooltip
          cursor={{ stroke: CHART_INK.axis }}
          content={({ active, label }) => {
            const point = active === true ? points.find(({ rank }) => rank === label) : undefined;
            return point === undefined ? null : <ChartTip tip={paretoTip(point, points.length)} />;
          }}
        />
        {classRanges(points).map(({ abcClass, first, last }) => (
          <ReferenceArea
            key={abcClass}
            x1={first}
            x2={last}
            fillOpacity={0}
            strokeOpacity={0}
            label={{ value: abcClass, position: "insideBottom", offset: 10, fill: CHART_INK.ink, fontSize: 13, fontWeight: 700 }}
          />
        ))}
        {limits.map((limit) => (
          <ReferenceLine
            key={limit}
            y={limit}
            stroke={CHART_INK.reference}
            strokeDasharray="5 4"
            label={{ value: formatPercentPlain(limit), position: "insideTopLeft", fill: CHART_INK.label, fontSize: 12 }}
          />
        ))}
        {CLASSES.map((abcClass) => (
          <Area
            key={abcClass}
            name={`Class ${abcClass}`}
            dataKey={abcClass}
            type="linear"
            stroke={ABC_MARKS[abcClass]}
            strokeWidth={2}
            fill={ABC_MARKS[abcClass]}
            fillOpacity={AREA_OPACITY}
            activeDot={{ r: 4, fill: ABC_MARKS[abcClass], stroke: CHART_INK.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
