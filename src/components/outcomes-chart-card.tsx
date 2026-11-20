import type { BucketValue, DeliveryOutcomes } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import { ChartCard } from "./chart-card";
import { Legend } from "./legend";
import { Marked } from "./marked";
import { OutcomeBars } from "./month-charts";
import { OUTCOME_SERIES } from "./series";

/** Delivery outcomes per month, stacked, with the year's totals in the legend and the months in a table (Overview, Delivery). */
export function OutcomesChartCard({
  months,
  delivered,
  dates,
  link,
}: {
  months: readonly BucketValue<DeliveryOutcomes>[];
  /** The year's delivered orders and their outcomes, from the KPIs. */
  delivered: { count: number } & DeliveryOutcomes;
  dates: string;
  link?: { href: string; label: string };
}) {
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
        headers: ["Month", ...OUTCOME_SERIES.map(({ label }) => label)],
        rows: months.map(({ bucket, value }) => [bucket.label, ...OUTCOME_SERIES.map(({ key }) => formatCount(value[key]))]),
      }}
    >
      <OutcomeBars months={months} />
    </ChartCard>
  );
}
