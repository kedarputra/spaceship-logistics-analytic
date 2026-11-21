import type { BucketValue, DeliveryOutcomes } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import type { ResultRow } from "@/tools/query";
import { ChartCard } from "./chart-card";
import { Legend } from "./legend";
import { Marked } from "./marked";
import { type MonthOutcomes, OutcomeBars } from "./month-charts";
import { OUTCOME_SERIES } from "./series";

/** Each month's outcomes with its delivered orders from the metric's rows, matched by the month's first day. */
function withDelivered(months: readonly BucketValue<DeliveryOutcomes>[], deliveredByMonth: readonly ResultRow[]): MonthOutcomes[] {
  const deliveredIn = new Map(deliveredByMonth.map((row) => [row.key, row.value]));
  return months.map((month) => {
    const delivered = deliveredIn.get(month.bucket.key);
    if (delivered === undefined || delivered === null) throw new Error(`No delivered orders for ${month.bucket.label}`);
    return { ...month, delivered };
  });
}

/** Delivery outcomes per month, stacked, with the year's totals in the legend and the months in a table (Overview, Delivery). */
export function OutcomesChartCard({
  months,
  deliveredByMonth,
  delivered,
  dates,
  link,
}: {
  months: readonly BucketValue<DeliveryOutcomes>[];
  /** Delivered orders per month, from the query tool: a column of the table, and what each month opens (ticket 26). */
  deliveredByMonth: readonly ResultRow[];
  /** The year's delivered orders and their outcomes, from the KPIs. */
  delivered: { count: number } & DeliveryOutcomes;
  dates: string;
  link?: { href: string; label: string };
}) {
  const perMonth = withDelivered(months, deliveredByMonth);
  return (
    <ChartCard
      title="Delivery outcomes per month"
      caption={`By delivery date · ${dates} · ${formatCount(delivered.count)} delivered`}
      link={link}
      legend={
        <Legend>
          {OUTCOME_SERIES.map(({ key, label, mark }) => (
            <li key={key}>
              <Marked mark={mark}>{`${label} ${formatCount(delivered[key])}`}</Marked>
            </li>
          ))}
        </Legend>
      }
      table={{
        headers: ["Month", ...OUTCOME_SERIES.map(({ label }) => label), "Delivered"],
        rows: perMonth.map(({ bucket, value, delivered: count }) => [bucket.label, ...OUTCOME_SERIES.map(({ key }) => formatCount(value[key])), formatCount(count)]),
      }}
    >
      <OutcomeBars months={perMonth} />
    </ChartCard>
  );
}
