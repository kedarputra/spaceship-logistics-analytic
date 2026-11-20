import type { ReactNode } from "react";
import type { BucketValue, DeliveryOutcomes, Ratio } from "@/domain/definitions";
import { SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatCount, formatFraction, formatPercent } from "@/domain/format";
import { formatDate, type Period } from "@/domain/periods";
import { chooseChart, type ResultShape } from "@/tools/chart";
import type { ResultRow } from "@/tools/query";
import { type DrawnChartType, Chart, type ChartRow, type ChartSeries } from "./chart";
import { SERIES_COLORS, SMALL_SAMPLE_BLUE } from "./palette";
import { OUTCOME_SERIES } from "./series";

interface ChartCardProps {
  title: string;
  caption: string;
  note?: string;
  chart: ReactNode;
  table: { columns: string[]; rows: string[][] };
}

/** A chart with its title, what it counts and over which dates, and its values as a table. */
function ChartCard({ title, caption, note, chart, table }: ChartCardProps) {
  return (
    <figure className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-900">{title}</h2>
      <figcaption className="text-xs text-slate-500">{caption}</figcaption>
      <div className="mt-3">{chart}</div>
      {note === undefined ? null : <p className="mt-2 text-xs text-slate-500">{note}</p>}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-600">Data table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col" className="border-b border-slate-200 py-1 pr-4 font-medium text-slate-600">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((cells) => (
              <tr key={cells[0]}>
                {cells.map((cell, index) => (
                  <td key={table.columns[index]} className="border-b border-slate-100 py-1 pr-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const ORDER_SERIES: ChartSeries[] = [{ key: "orders", label: "Orders", color: SERIES_COLORS.blue }];

const DELAY_RATE_SERIES: ChartSeries[] = [
  { key: "delayRate", label: "Delay rate", color: SERIES_COLORS.blue, mutedColor: SMALL_SAMPLE_BLUE },
];

/** The chart type chooseChart picks for a shape the dashboard draws. */
function chartTypeFor(shape: ResultShape): DrawnChartType {
  const type = chooseChart(shape);
  if (type === "answer-card") throw new Error("A dashboard chart always has a dimension, so it is never an answer card");
  return type;
}

interface DashboardChartsProps {
  period: Period;
  ordersPerMonth: BucketValue<number>[];
  outcomesPerMonth: BucketValue<DeliveryOutcomes>[];
  /** Delay rate per carrier, ranked by the query tool. */
  carriers: ResultRow[];
}

/** A rate row's parts; a row without them is not a rate, which would be a bug upstream. */
function ratioOf(row: ResultRow): Ratio {
  if (row.numerator === undefined || row.denominator === undefined) throw new Error(`"${row.label}" carries no rate`);
  return { numerator: row.numerator, denominator: row.denominator, value: row.value };
}

/** The three charts of R2. Shows computed results; the chart type comes from chooseChart. */
export function DashboardCharts({ period, ordersPerMonth, outcomesPerMonth, carriers }: DashboardChartsProps) {
  const dates = `${formatDate(period.from)} – ${formatDate(period.to)}`;

  const carrierRows: ChartRow[] = carriers.map((row) => ({
    label: `${row.label} (n=${formatCount(row.n)})`,
    values: { delayRate: row.value },
    muted: row.smallSample,
  }));

  return (
    <div className="mt-6 grid gap-4">
      <ChartCard
        title="Orders per month"
        caption={`By order date · ${dates}`}
        chart={
          <Chart
            type={chartTypeFor({ dimension: "time", measure: "count" })}
            series={ORDER_SERIES}
            rows={ordersPerMonth.map(({ bucket, value }) => ({ label: bucket.label, values: { orders: value } }))}
            valueFormat="orders"
          />
        }
        table={{
          columns: ["Month", "Orders"],
          rows: ordersPerMonth.map(({ bucket, value }) => [bucket.label, formatCount(value)]),
        }}
      />
      <ChartCard
        title="Delivery outcomes per month"
        caption={`By delivery date · ${dates}`}
        chart={
          <Chart
            type={chartTypeFor({ dimension: "time", measure: "count", shareOfWhole: true })}
            series={OUTCOME_SERIES}
            rows={outcomesPerMonth.map(({ bucket, value }) => ({
              label: bucket.label,
              values: Object.fromEntries(OUTCOME_SERIES.map(({ key }) => [key, value[key]])),
            }))}
            valueFormat="orders"
          />
        }
        table={{
          columns: ["Month", ...OUTCOME_SERIES.map(({ label }) => label)],
          rows: outcomesPerMonth.map(({ bucket, value }) => [
            bucket.label,
            ...OUTCOME_SERIES.map(({ key }) => formatCount(value[key])),
          ]),
        }}
      />
      <ChartCard
        title="Delay rate by carrier"
        caption={`By delivery date · ${dates} · delayed orders ÷ delivered orders`}
        note={`Lighter bars: fewer than ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders, a small sample.`}
        chart={
          <Chart
            type={chartTypeFor({ dimension: "category", measure: "rate" })}
            series={DELAY_RATE_SERIES}
            rows={carrierRows}
            valueFormat="percent"
          />
        }
        table={{
          columns: ["Carrier", "Delay rate", "Delayed / delivered", "Note"],
          rows: carriers.map((row) => [
            row.label,
            formatPercent(row.value),
            formatFraction(ratioOf(row)),
            row.smallSample ? "Small sample" : "",
          ]),
        }}
      />
    </div>
  );
}
