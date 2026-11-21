import { METRIC_STATUSES, SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatFraction, formatOf, formatPercent, formatPercentPlain } from "@/domain/format";
import type { QueryResult, ResultRow } from "@/tools/query";
import { andList, dateFieldWords } from "@/tools/words";
import { monthOrdersLink } from "./card-link";
import { ChartCard } from "./chart-card";
import { ON_TIME_BY_MONTH_ID } from "./delivery-anchors";
import { Legend } from "./legend";
import { monthOnly, Plot } from "./month-charts";
import type { MonthTip } from "./month-hover";
import { MARKS } from "./palette";
import { rowRatio } from "./row-ratio";
import { extremeIndexes, rateAxis } from "./scale";

/**
 * A rate per month as a line (Delivery, ticket 25): the year's rate as a dashed reference, months
 * under 20 deliveries as hollow points, and value labels on the highest and lowest only. The axis may
 * start above 0 because this is a line, never a bar. Text, points and labels are HTML over the plot, so
 * they keep their size at any width. Every value arrives computed.
 */

/** A value's height in the plot, in percent down from the top. */
function heightOf(value: number, range: { min: number; max: number }): number {
  return (1 - (value - range.min) / (range.max - range.min)) * 100;
}

/** A month's tooltip (ticket 26): the rate and its ratio, "small sample" under 20 deliveries, and its delivered orders by delivery date. */
function rateTip(row: ResultRow): MonthTip {
  if (row.value === null) return { heading: row.label, rows: [], note: "No deliveries" };
  return {
    heading: row.label,
    rows: [{ value: formatPercent(row.value), name: "on time", color: MARKS.onTime }],
    note: `${formatOf(rowRatio(row))} delivered on time`,
    smallSample: row.smallSample,
    link: monthOrdersLink(row.n, "delivered orders", row.key, "delivery", { status: METRIC_STATUSES.on_time_rate }),
  };
}

/** A month's point, hollow for a small sample and grown while its month is shown, with its value above or below it when labelled. */
function RatePoint({ value, top, smallSample, label }: { value: number; top: number; smallSample: boolean; label: "above" | "below" | null }) {
  const fill = smallSample ? "size-[10px] border-2 border-mark-on-time bg-panel" : "size-[7px] bg-mark-on-time";
  const labelShift = label === "above" ? "-translate-y-[22px]" : "translate-y-2";
  return (
    <>
      <span
        data-small-sample={smallSample ? "true" : undefined}
        className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[scale] group-data-active/month:scale-150 ${fill}`}
        style={{ top: `${top}%` }}
      />
      {label === null ? null : (
        <span data-point-label={formatPercent(value)} className={`absolute left-1/2 -translate-x-1/2 text-tick font-bold text-ink ${labelShift}`} style={{ top: `${top}%` }}>
          {formatPercent(value)}
        </span>
      )}
    </>
  );
}

function RateLinePlot({ rows, overall }: { rows: readonly ResultRow[]; overall: number | null }) {
  const range = axisOfRates(rows);
  const points = rows.flatMap((row, index) => (row.value === null ? [] : [{ index, value: row.value }]));
  // The months at the highest and the lowest rate carry a label, the highest above its point.
  const labelled = new Set([...extremeIndexes(points.map(({ value }) => value))].map((point) => points[point]?.index));
  const highest = Math.max(...points.map(({ value }) => value));
  // The line joins the months' centres, as the slots of the plot lay them out.
  const line = points.map(({ index, value }) => `${(((index + 0.5) / rows.length) * 100).toFixed(2)},${heightOf(value, range).toFixed(2)}`);
  return (
    <Plot
      ticks={range.ticks}
      min={range.min}
      max={range.max}
      formatTick={formatPercentPlain}
      months={rows.map((row) => monthOnly(row.label))}
      description="On-time delivery rate per month, as a line. The data table lists every value."
      tips={rows.map(rateTip)}
      crosshair
      marks={rows.map(({ value, smallSample }, index) => {
        if (value === null) return null;
        const label = value === highest ? "above" : "below";
        return <RatePoint value={value} top={heightOf(value, range)} smallSample={smallSample} label={labelled.has(index) ? label : null} />;
      })}
    >
      {/* The line and the year's rate, stretched to the plot; their strokes keep their width. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
        {overall === null ? null : (
          <line x1={0} x2={100} y1={heightOf(overall, range)} y2={heightOf(overall, range)} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" className="stroke-grey-green" />
        )}
        <polyline
          points={line.join(" ")}
          fill="none"
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-mark-on-time"
        />
      </svg>
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
      id={ON_TIME_BY_MONTH_ID}
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
