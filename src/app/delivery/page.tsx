import { CardPair } from "@/components/card-pair";
import { ChartCard } from "@/components/chart-card";
import { DaysFigure, FigureCard } from "@/components/figure-card";
import { OutcomesChartCard } from "@/components/outcomes-chart-card";
import { PageHeader } from "@/components/page-header";
import { type RankedBar, RankedBars } from "@/components/ranked-bars";
import { OnTimeLineCard } from "@/components/rate-line";
import { dashboardKpis, deliveryOutcomesOverTime, exceptionRate } from "@/domain/definitions";
import { formatCount, formatDays, formatOf, formatPercent } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { dataPeriod, formatPeriod } from "@/domain/periods";
import { dateFieldWords } from "@/tools/words";
import { queryResult } from "../query-result";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** Average delivery time per region or warehouse, slowest first, each with n and its on-time rate. */
function placeBars(groupBy: "region" | "warehouse"): RankedBar[] {
  const times = queryResult({ metric: "average_delivery_time", groupBy, sort: "desc" });
  const onTime = new Map(queryResult({ metric: "on_time_rate", groupBy }).rows.map((row) => [row.key, row]));
  return times.rows.map((row) => {
    // Every place with a delivery time has an on-time rate: both are over the same delivered orders.
    const rate = onTime.get(row.key);
    if (rate === undefined) throw new Error(`No on-time rate for ${row.label}`);
    return { label: row.label, value: row.value, valueText: formatDays(row.value), detail: `n=${formatCount(row.n)} · ${formatPercent(rate.value)} on time` };
  });
}

/** Delivery (ADR 0011 §5, ticket 25): how the delivered orders arrived. Every figure is computed by the definitions and the query tool. */
export default function DeliveryPage() {
  const { orders } = getDataset();
  const period = dataPeriod(orders);
  const dates = formatPeriod(period);
  const kpis = dashboardKpis(orders);
  const { totalOrders, deliveredOrders, delayedOrders, onTimeRate, averageDeliveryDays } = kpis;
  const exceptions = exceptionRate(orders);
  const onTimeByMonth = queryResult({ metric: "on_time_rate", groupBy: "month" });

  return (
    <>
      <PageHeader
        label="Delivery"
        title="Delivery"
        description={`How the ${formatCount(deliveredOrders.count)} delivered orders arrived, by ${dateFieldWords(onTimeByMonth.dateField)}, ${dates}.`}
      />
      <section aria-label="Delivery figures">
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,168px),1fr))] gap-3">
          <FigureCard
            label="Delivered orders"
            value={formatCount(deliveredOrders.count)}
            detail={`of ${formatCount(totalOrders.count)} orders · ${formatCount(totalOrders.notDelivered)} not delivered: ${formatCount(totalOrders.inTransit)} in transit, ${formatCount(totalOrders.canceled)} canceled`}
          />
          <FigureCard label="On-time delivery rate" value={formatPercent(onTimeRate.value)} detail={`${formatOf(onTimeRate)} delivered`} />
          <FigureCard label="Delay rate" value={formatPercent(delayedOrders.delayRate.value)} detail={`${formatOf(delayedOrders.delayRate)} delivered`} />
          <FigureCard
            label="Exceptions"
            value={formatCount(exceptions.numerator)}
            detail={`${formatPercent(exceptions.value)} of delivered; not counted as delayed`}
          />
          <FigureCard label="Average delivery time" value={<DaysFigure days={averageDeliveryDays.value} />} detail="order date to delivery date" />
        </ul>
      </section>
      <CardPair label="Delivery over time">
        <OutcomesChartCard months={deliveryOutcomesOverTime(orders, period, "month")} delivered={deliveredOrders} dates={dates} />
        <OnTimeLineCard result={onTimeByMonth} />
      </CardPair>
      <CardPair label="Delivery time by place">
        <ChartCard id="regions-title" title="Average delivery time by region" caption="Days from order to delivery · slowest first">
          <RankedBars tone="green" bars={placeBars("region")} />
        </ChartCard>
        <ChartCard id="warehouses-title" title="Average delivery time by warehouse" caption="Days from order to delivery · slowest first">
          <RankedBars tone="green" bars={placeBars("warehouse")} />
        </ChartCard>
      </CardPair>
    </>
  );
}
