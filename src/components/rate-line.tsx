import { SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatFraction, formatOf, formatPercent, formatPercentPlain } from "@/domain/format";
import type { QueryResult, ResultRow } from "@/tools/query";
import { andList, dateFieldWords } from "@/tools/words";
import { ChartCard } from "./chart-card";
import { Legend } from "./legend";
import { monthOnly, Plot } from "./month-charts";
import { rowRatio } from "./row-ratio";
import { extremeIndexes, rateAxis } from "./scale";

/**
 * A rate per month as a line (Delivery, ticket 25): the year's rate as a dashed reference, months
 * under 20 deliveries as hollow points, and value labels on the highest and lowest only. The axis may
 * start above 0 because this is a line, never a bar. Text, points and labels are HTML over the plot, so
 * they keep their size at any width. Every value arrives computed.
 */

/** A point's place in the plot, in percent: across from the left, down from the top. */
function place(index: number, count: number, value: number, range: { min: number; max: number }) {
  return { x: ((index + 0.5) / count) * 100, y: (1 - (value - range.min) / (range.max - range.min)) * 100 };
}

function RateLinePlot({ rows, overall }: { rows: readonly ResultRow[]; overall: number | null }) {
  const { min, max, ticks } = axisOfRates(rows);
  const points = rows.flatMap((row, index) => (row.value === null ? [] : [{ row, ...place(index, rows.length, row.value, { min, max }), value: row.value }]));
  const labelled = extremeIndexes(points.map(({ value }) => value));
  const highest = Math.max(...points.map(({ value }) => value));
  return (
    <Plot
      ticks={ticks}
      min={min}
      max={max}
      formatTick={formatPercentPlain}
      gapless
      months={rows.map((row) => monthOnly(row.label))}
      description="On-time delivery rate per month, as a line. The data table lists every value."
    >
      {/* The line and the year's rate, stretched to the plot; their strokes keep their width. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        {overall === null ? null : (
          <line x1={0} x2={100} y1={place(0, 1, overall, { min, max }).y} y2={place(0, 1, overall, { min, max }).y} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" className="stroke-grey-green" />
        )}
        <polyline
          points={points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
          fill="none"
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-mark-on-time"
        />
      </svg>
      {points.map(({ row, x, y, value }, point) => (
        <span key={row.key}>
          <span
            title={`${row.label}: ${formatPercent(value)} (${formatOf(rowRatio(row))})${row.smallSample ? ", a small sample" : ""}`}
            data-small-sample={row.smallSample ? "true" : undefined}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${row.smallSample ? "size-[10px] border-2 border-mark-on-time bg-panel" : "size-[7px] bg-mark-on-time"}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          />
          {labelled.has(point) ? (
            <span
              data-point-label={formatPercent(value)}
              className={`absolute -translate-x-1/2 text-tick font-bold text-ink ${value === highest ? "-translate-y-[22px]" : "translate-y-2"}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {formatPercent(value)}
            </span>
          ) : null}
        </span>
      ))}
    </Plot>
  );
}

/** The rows' axis: from below the lowest rate to 100% (scale.ts). */
function axisOfRates(rows: readonly ResultRow[]) {
  return rateAxis(rows.flatMap(({ value }) => (value === null ? [] : [value])));
}

/** "Jun (15 of 18) and Nov (16 of 19) had fewer than 20 deliveries, so …", or nothing when no month did. */
function smallMonthsNote(rows: readonly ResultRow[]): string {
  const small = rows.filter((row) => row.smallSample);
  if (small.length === 0) return "";
  const named = small.map((row) => `${monthOnly(row.label)} (${formatOf(rowRatio(row))})`);
  return `${andList(named)} had fewer than ${SMALL_SAMPLE_MIN_DELIVERED} deliveries, so one delivery more or less moves them by several points. `;
}

/** The on-time delivery rate per month, from the query tool (Delivery, ticket 25). */
export function OnTimeLineCard({ result }: { result: QueryResult }) {
  const overall = result.overall?.value ?? null;
  return (
    <ChartCard
      id="ontime-title"
      title="On-time delivery rate per month"
      caption={`On-time ÷ delivered · by ${dateFieldWords(result.dateField)}`}
      legend={
        <Legend>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-3.5 bg-mark-on-time" />
            Monthly rate
          </li>
          {overall === null ? null : (
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="w-3.5 border-t-2 border-dashed border-grey-green" />
              {`Year: ${formatPercent(overall)}`}
            </li>
          )}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-mark-on-time bg-panel" />
            {`Under ${SMALL_SAMPLE_MIN_DELIVERED} deliveries`}
          </li>
        </Legend>
      }
      table={{
        headers: ["Month", result.metric.label, "On time / delivered", "Note"],
        rows: result.rows.map((row) => [
          row.label,
          formatPercent(row.value),
          formatFraction(rowRatio(row)),
          row.smallSample ? "Small sample" : "",
        ]),
      }}
    >
      <RateLinePlot rows={result.rows} overall={overall} />
      <p className="text-caption text-muted">{`${smallMonthsNote(result.rows)}The axis starts at ${formatPercentPlain(axisOfRates(result.rows).min)}.`}</p>
    </ChartCard>
  );
}
